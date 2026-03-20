using Azure;
using Azure.AI.Vision.ImageAnalysis;
using Azure.Identity;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights();

builder.Services.AddSingleton(sp =>
{
    var endpoint = Environment.GetEnvironmentVariable("VISION_ENDPOINT")
        ?? throw new InvalidOperationException("VISION_ENDPOINT environment variable is required.");

    var key = Environment.GetEnvironmentVariable("VISION_KEY");

    if (!string.IsNullOrEmpty(key))
    {
        return new ImageAnalysisClient(new Uri(endpoint), new AzureKeyCredential(key));
    }

    return new ImageAnalysisClient(new Uri(endpoint), new DefaultAzureCredential());
});

builder.Build().Run();
