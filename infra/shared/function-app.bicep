param name string
@description('Primary location for all resources')
param location string = resourceGroup().location
param tags object = {}
param applicationInsightsName string = ''
param appServicePlanId string
param appSettings object = {}
param runtimeName string
param runtimeVersion string
param serviceName string
param storageAccountName string
param deploymentStorageContainerName string
param virtualNetworkSubnetResourceId string = ''
param instanceMemoryMB int = 2048
param maximumInstanceCount int = 100
param identityId string = ''
param identityClientId string = ''
param enableBlob bool = true
param enableQueue bool = false
param enableTable bool = false
param enableFile bool = false

@allowed(['SystemAssigned', 'UserAssigned'])
param identityType string = 'UserAssigned'

// Authorization parameters
@description('The Entra ID application (client) ID for App Service Authentication')
param authClientId string = ''

@description('The Entra ID identifier URI for App Service Authentication')
param authIdentifierUri string = ''

@description('The OAuth2 scopes exposed by the application for App Service Authentication')
param authExposedScopes array = []

@description('The Azure AD tenant ID for App Service Authentication')
param authTenantId string = ''

@description('OAuth2 delegated permissions for App Service Authentication login flow')
param delegatedPermissions array = ['User.Read']

@description('Client application IDs to pre-authorize for the default scope')
param preAuthorizedClientIds array = []

var applicationInsightsIdentity = 'ClientId=${identityClientId};Authorization=AAD'
var kind = 'functionapp,linux'

// Create base application settings
var baseAppSettings = {
  AzureWebJobsStorage__credential: 'managedidentity'
  AzureWebJobsStorage__clientId: identityClientId
  APPLICATIONINSIGHTS_AUTHENTICATION_STRING: applicationInsightsIdentity
  APPLICATIONINSIGHTS_CONNECTION_STRING: applicationInsights.properties.ConnectionString
}

// Dynamically build storage endpoint settings based on feature flags
var blobSettings = enableBlob ? { AzureWebJobsStorage__blobServiceUri: stg.properties.primaryEndpoints.blob } : {}
var queueSettings = enableQueue ? { AzureWebJobsStorage__queueServiceUri: stg.properties.primaryEndpoints.queue } : {}
var tableSettings = enableTable ? { AzureWebJobsStorage__tableServiceUri: stg.properties.primaryEndpoints.table } : {}
var fileSettings = enableFile ? { AzureWebJobsStorage__fileServiceUri: stg.properties.primaryEndpoints.file } : {}

// Create auth-specific app settings when auth parameters are provided
var authAppSettings = (!empty(authIdentifierUri) && !empty(identityClientId)) ? {
  WEBSITE_AUTH_PRM_DEFAULT_WITH_SCOPES: '${authIdentifierUri}/user_impersonation'
  OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID: identityClientId
  WEBSITE_AUTH_AAD_ALLOWED_TENANTS: authTenantId
} : {}

// Merge all app settings
var allAppSettings = union(
  appSettings,
  blobSettings,
  queueSettings,
  tableSettings,
  fileSettings,
  baseAppSettings,
  authAppSettings
)

resource stg 'Microsoft.Storage/storageAccounts@2022-09-01' existing = {
  name: storageAccountName
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' existing = if (!empty(applicationInsightsName)) {
  name: applicationInsightsName
}

module functionApp 'br/public:avm/res/web/site:0.21.0' = {
  name: '${serviceName}-flex-consumption'
  params: {
    kind: kind
    name: name
    location: location
    tags: union(tags, { 'azd-service-name': serviceName })
    serverFarmResourceId: appServicePlanId
    managedIdentities: {
      systemAssigned: identityType == 'SystemAssigned'
      userAssignedResourceIds: [
        '${identityId}'
      ]
    }
    configs: !empty(authClientId) && !empty(authTenantId) ? [
      {
        name: 'appsettings'
        properties: allAppSettings
      }
      {
        name: 'authsettingsV2'
        properties: {
          globalValidation: {
            requireAuthentication: true
            unauthenticatedClientAction: 'Return401'
            redirectToProvider: 'azureactivedirectory'
          }
          httpSettings: {
            requireHttps: true
            routes: {
              apiPrefix: '/.auth'
            }
            forwardProxy: {
              convention: 'NoProxy'
            }
          }
          identityProviders: {
            azureActiveDirectory: {
              enabled: true
              registration: {
                openIdIssuer: '${environment().authentication.loginEndpoint}${authTenantId}/v2.0'
                clientId: authClientId
              }
              login: {
                loginParameters: [
                  'scope=openid profile email ${join(delegatedPermissions, ' ')}'
                ]
              }
              validation: {
                jwtClaimChecks: {}
                allowedAudiences: [
                  authIdentifierUri
                  authClientId
                ]
                defaultAuthorizationPolicy: {
                  allowedPrincipals: {}
                }
              }
              isAutoProvisioned: false
            }
          }
          login: {
            routes: {
              logoutEndpoint: '/.auth/logout'
            }
            tokenStore: {
              enabled: true
              tokenRefreshExtensionHours: 72
              fileSystem: {}
              azureBlobStorage: {}
            }
            preserveUrlFragmentsForLogins: false
            allowedExternalRedirectUrls: []
            cookieExpiration: {
              convention: 'FixedTime'
              timeToExpiration: '08:00:00'
            }
            nonce: {
              validateNonce: true
              nonceExpirationInterval: '00:05:00'
            }
          }
          platform: {
            enabled: true
            runtimeVersion: '~1'
          }
        }
      }
    ] : [
      {
        name: 'appsettings'
        properties: allAppSettings
      }
    ]
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${stg.properties.primaryEndpoints.blob}${deploymentStorageContainerName}'
          authentication: {
            type: identityType == 'SystemAssigned' ? 'SystemAssignedIdentity' : 'UserAssignedIdentity'
            userAssignedIdentityResourceId: identityType == 'UserAssigned' ? identityId : ''
          }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: instanceMemoryMB
        maximumInstanceCount: maximumInstanceCount
      }
      runtime: {
        name: runtimeName
        version: runtimeVersion
      }
    }
    siteConfig: {
      alwaysOn: false
    }
    virtualNetworkSubnetResourceId: !empty(virtualNetworkSubnetResourceId) ? virtualNetworkSubnetResourceId : null
  }
}

output name string = functionApp.outputs.name
output defaultHostname string = functionApp.outputs.defaultHostname
output identityPrincipalId string = identityType == 'SystemAssigned' ? functionApp.outputs.?systemAssignedMIPrincipalId ?? '' : ''

// Authorization outputs
var scopeValues = [for scope in authExposedScopes: scope.value]
output authEnabled bool = !empty(authClientId) && !empty(authTenantId)
output configuredScopes string = !empty(authExposedScopes) ? join(scopeValues, ','): ''
