targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment which is used to generate a short unique hash used in all resources.')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
@metadata({
  azd: {
    type: 'location'
  }
})
param location string

@description('Name of the service to deploy (used for azd service mapping)')
param serviceName string = 'api'

param functionAppName string = ''
param userAssignedIdentityName string = ''
param applicationInsightsName string = ''
param appServicePlanName string = ''
param logAnalyticsName string = ''
param resourceGroupName string = ''
param storageAccountName string = ''
param vNetName string = ''
param vnetEnabled bool = false

@description('Enable Easy Auth (Microsoft Entra ID) for the function app')
param easyAuthEnabled bool = false

@description('References application or service contact information from a Service or Asset Management database')
param serviceManagementReference string = ''

@description('Comma-separated list of client application IDs to pre-authorize for accessing the MCP API (optional)')
param preAuthorizedClientIds string = ''

@description('OAuth2 delegated permissions for App Service Authentication login flow')
param delegatedPermissions array = ['https://graph.microsoft.com/User.Read']

@description('Id of the user identity for testing and debugging. Leave empty if not needed.')
param principalId string = deployer().objectId

@description('Additional app settings to pass to the function app')
param additionalAppSettings object = {}

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }
var appName = !empty(functionAppName) ? functionAppName : '${abbrs.webSitesFunctions}${serviceName}-${resourceToken}'
var deploymentStorageContainerName = 'app-package-${take(appName, 32)}-${take(toLower(uniqueString(appName, resourceToken)), 7)}'

// Convert comma-separated string to array for pre-authorized client IDs
var preAuthorizedClientIdsArray = !empty(preAuthorizedClientIds) ? map(split(preAuthorizedClientIds, ','), clientId => trim(clientId)) : []

var storageEndpointConfig = {
  enableBlob: true
  enableQueue: true
  enableTable: false
  allowUserIdentityPrincipal: true
}

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: !empty(resourceGroupName) ? resourceGroupName : '${abbrs.resourcesResourceGroups}${environmentName}'
  location: location
  tags: tags
}

// User Assigned Managed Identity
module userAssignedIdentity 'br/public:avm/res/managed-identity/user-assigned-identity:0.4.1' = {
  name: 'userAssignedIdentity'
  scope: rg
  params: {
    location: location
    tags: tags
    name: !empty(userAssignedIdentityName) ? userAssignedIdentityName : '${abbrs.managedIdentityUserAssignedIdentities}${serviceName}-${resourceToken}'
  }
}

// App Service Plan (Flex Consumption)
module appServicePlan 'br/public:avm/res/web/serverfarm:0.1.1' = {
  name: 'appserviceplan'
  scope: rg
  params: {
    name: !empty(appServicePlanName) ? appServicePlanName : '${abbrs.webServerFarms}${resourceToken}'
    sku: {
      name: 'FC1'
      tier: 'FlexConsumption'
    }
    reserved: true
    location: location
    tags: tags
  }
}

// Entra ID application registration for EasyAuth (optional)
module entraApp 'shared/entra-app.bicep' = if (easyAuthEnabled) {
  name: 'entraApp'
  scope: rg
  params: {
    appUniqueName: '${appName}-auth'
    appDisplayName: 'MCP Authorization App (${appName})'
    serviceManagementReference: serviceManagementReference
    functionAppHostname: '${appName}.azurewebsites.net'
    preAuthorizedClientIds: preAuthorizedClientIdsArray
    managedIdentityClientId: userAssignedIdentity.outputs.clientId
    managedIdentityPrincipalId: userAssignedIdentity.outputs.principalId
    tags: tags
  }
}

// Function App
module functionApp 'shared/function-app.bicep' = {
  name: 'functionApp'
  scope: rg
  params: {
    name: appName
    serviceName: serviceName
    location: location
    tags: tags
    applicationInsightsName: monitoring.outputs.name
    appServicePlanId: appServicePlan.outputs.resourceId
    runtimeName: 'dotnet-isolated'
    runtimeVersion: '10.0'
    storageAccountName: storage.outputs.name
    enableBlob: storageEndpointConfig.enableBlob
    enableQueue: storageEndpointConfig.enableQueue
    enableTable: storageEndpointConfig.enableTable
    deploymentStorageContainerName: deploymentStorageContainerName
    identityId: userAssignedIdentity.outputs.resourceId
    identityClientId: userAssignedIdentity.outputs.clientId
    appSettings: additionalAppSettings
    virtualNetworkSubnetResourceId: vnetEnabled ? serviceVirtualNetwork!.outputs.appSubnetID : ''
    // Authorization parameters (only passed when easyAuth is enabled)
    authClientId: easyAuthEnabled ? entraApp!.outputs.applicationId : ''
    authIdentifierUri: easyAuthEnabled ? entraApp!.outputs.identifierUri : ''
    authExposedScopes: easyAuthEnabled ? entraApp!.outputs.exposedScopes : []
    authTenantId: tenant().tenantId
    delegatedPermissions: delegatedPermissions
    preAuthorizedClientIds: preAuthorizedClientIdsArray
  }
}

// Storage Account
module storage 'br/public:avm/res/storage/storage-account:0.8.3' = {
  name: 'storage'
  scope: rg
  params: {
    name: !empty(storageAccountName) ? storageAccountName : '${abbrs.storageStorageAccounts}${resourceToken}'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    dnsEndpointType: 'Standard'
    publicNetworkAccess: vnetEnabled ? 'Disabled' : 'Enabled'
    networkAcls: vnetEnabled ? {
      defaultAction: 'Deny'
      bypass: 'None'
    } : {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
    blobServices: {
      containers: [
        { name: deploymentStorageContainerName }
      ]
    }
    minimumTlsVersion: 'TLS1_2'
    location: location
    tags: tags
    skuName: 'Standard_LRS'
  }
}

// RBAC
module rbac 'shared/rbac.bicep' = {
  name: 'rbacAssignments'
  scope: rg
  params: {
    storageAccountName: storage.outputs.name
    appInsightsName: monitoring.outputs.name
    managedIdentityPrincipalId: userAssignedIdentity.outputs.principalId
    userIdentityPrincipalId: principalId
    enableBlob: storageEndpointConfig.enableBlob
    enableQueue: storageEndpointConfig.enableQueue
    enableTable: storageEndpointConfig.enableTable
    allowUserIdentityPrincipal: storageEndpointConfig.allowUserIdentityPrincipal
  }
}

// Virtual Network (optional)
module serviceVirtualNetwork 'shared/vnet.bicep' = if (vnetEnabled) {
  name: 'serviceVirtualNetwork'
  scope: rg
  params: {
    location: location
    tags: tags
    vNetName: !empty(vNetName) ? vNetName : '${abbrs.networkVirtualNetworks}${resourceToken}'
  }
}

module storagePrivateEndpoint 'shared/storage-private-endpoint.bicep' = if (vnetEnabled) {
  name: 'servicePrivateEndpoint'
  scope: rg
  params: {
    location: location
    tags: tags
    virtualNetworkName: !empty(vNetName) ? vNetName : '${abbrs.networkVirtualNetworks}${resourceToken}'
    subnetName: vnetEnabled ? serviceVirtualNetwork!.outputs.peSubnetName : ''
    resourceName: storage.outputs.name
    enableBlob: storageEndpointConfig.enableBlob
    enableQueue: storageEndpointConfig.enableQueue
    enableTable: storageEndpointConfig.enableTable
  }
}

// Monitoring
module logAnalytics 'br/public:avm/res/operational-insights/workspace:0.11.1' = {
  name: '${uniqueString(deployment().name, location)}-loganalytics'
  scope: rg
  params: {
    name: !empty(logAnalyticsName) ? logAnalyticsName : '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    location: location
    tags: tags
    dataRetention: 30
  }
}

module monitoring 'br/public:avm/res/insights/component:0.6.0' = {
  name: '${uniqueString(deployment().name, location)}-appinsights'
  scope: rg
  params: {
    name: !empty(applicationInsightsName) ? applicationInsightsName : '${abbrs.insightsComponents}${resourceToken}'
    location: location
    tags: tags
    workspaceResourceId: logAnalytics.outputs.resourceId
    disableLocalAuth: true
  }
}

// Outputs
output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.connectionString
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output SERVICE_NAME string = functionApp.outputs.name
output SERVICE_DEFAULT_HOSTNAME string = functionApp.outputs.defaultHostname
output AZURE_FUNCTION_NAME string = functionApp.outputs.name

// Entra App outputs (only populated when easyAuth is enabled)
output ENTRA_APPLICATION_ID string = easyAuthEnabled ? entraApp!.outputs.applicationId : ''
output ENTRA_APPLICATION_OBJECT_ID string = easyAuthEnabled ? entraApp!.outputs.applicationObjectId : ''
output ENTRA_SERVICE_PRINCIPAL_ID string = easyAuthEnabled ? entraApp!.outputs.servicePrincipalId : ''
output ENTRA_IDENTIFIER_URI string = easyAuthEnabled ? entraApp!.outputs.identifierUri : ''

// Authorization outputs
output AUTH_ENABLED bool = easyAuthEnabled ? functionApp.outputs.authEnabled : false
output CONFIGURED_SCOPES string = easyAuthEnabled ? functionApp.outputs.configuredScopes : ''

// Pre-authorized applications
output PRE_AUTHORIZED_CLIENT_IDS string = preAuthorizedClientIds

// Entra App redirect URI outputs
output CONFIGURED_REDIRECT_URIS array = easyAuthEnabled ? entraApp!.outputs.configuredRedirectUris : []
output AUTH_REDIRECT_URI string = easyAuthEnabled ? entraApp!.outputs.authRedirectUri : ''
