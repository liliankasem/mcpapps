# MCP App Template

This is the boilerplate template for creating new MCP server apps in the mcpapps repository.

## How to use this template

1. Copy this folder to `src/<YourAppName>/`
2. Rename `McpAppTemplate.csproj` to `<YourAppName>.csproj`
3. Update `azure.yaml` with your app name
4. Update `host.json` MCP extension settings (serverName, instructions, etc.)
5. Add the project to the solution: `dotnet sln McpApps.slnx add src/<YourAppName>/<YourAppName>.csproj`
6. Add your MCP tool functions

## Files

| File | Purpose |
|------|---------|
| `McpAppTemplate.csproj` | Project file with MCP extension + worker references |
| `Program.cs` | Host startup with Application Insights |
| `host.json` | Functions host config with MCP extension section |
| `local.settings.json` | Local development settings (not published) |
| `azure.yaml` | Azure Developer CLI deployment config |

## Running locally

```bash
func start
```

## Deploying

```bash
azd up
```
