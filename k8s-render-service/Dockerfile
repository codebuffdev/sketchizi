FROM golang:1.24-alpine AS build
WORKDIR /src
COPY main.go .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/k8s-render-service main.go

FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl tar gzip && \
    curl -fsSL https://get.helm.sh/helm-v3.17.3-linux-amd64.tar.gz -o /tmp/helm.tgz && \
    tar -xzf /tmp/helm.tgz -C /tmp && install -m 0755 /tmp/linux-amd64/helm /usr/local/bin/helm && \
    curl -fsSL https://dl.k8s.io/release/v1.32.3/bin/linux/amd64/kubectl -o /usr/local/bin/kubectl && chmod 0755 /usr/local/bin/kubectl && \
    rm -rf /tmp/*
COPY --from=build /out/k8s-render-service /usr/local/bin/k8s-render-service
ENV PORT=8080
EXPOSE 8080
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/k8s-render-service"]
