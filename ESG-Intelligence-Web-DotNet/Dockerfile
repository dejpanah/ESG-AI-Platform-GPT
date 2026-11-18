FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY EnterpriseKnowledge.WebUI.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:5180
ENV RagApi__BaseUrl=http://host.docker.internal:8000/
EXPOSE 5180
ENTRYPOINT ["dotnet","EnterpriseKnowledge.WebUI.dll"]
