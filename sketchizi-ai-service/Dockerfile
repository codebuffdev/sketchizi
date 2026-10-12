# Build the standalone AI service independently from the frontend and auth service.
FROM maven:3.9.11-eclipse-temurin-17-alpine AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -B -q -DskipTests package && cp target/sketchizi-ai-service-1.0.0.jar /workspace/app.jar

FROM eclipse-temurin:17-jre-alpine AS runtime
WORKDIR /app
RUN addgroup -S sketchizi && adduser -S -G sketchizi -u 10001 sketchizi
COPY --from=build --chown=sketchizi:sketchizi /workspace/app.jar /app/app.jar
USER 10001:10001
EXPOSE 8090
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-Djava.security.egd=file:/dev/./urandom", "-jar", "/app/app.jar"]
