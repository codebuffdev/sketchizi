// Definition-driven AWS intelligent resources.
// Phase 2B expands the Phase 2A registry without changing the generic
// resource creation/update architecture.

const EC2_ICON_ID = "aws:service:compute:amazon-ec2:arch-compute-32-arch-amazon-ec2-32-svg";
const S3_ICON_ID = "aws:service:storage:amazon-simple-storage-service:arch-storage-32-arch-amazon-simple-storage-service-32-svg";
const LAMBDA_ICON_ID = "aws:service:compute:aws-lambda:arch-compute-32-arch-aws-lambda-32-svg";
const RDS_ICON_ID = "aws:service:databases:amazon-rds:arch-databases-32-arch-amazon-rds-32-svg";

const API_GATEWAY_ICON_ID = "aws:service:networking-content-delivery:amazon-api-gateway:arch-networking-content-delivery-32-arch-amazon-api-gateway-32-svg";
const CLOUDFRONT_ICON_ID = "aws:service:networking-content-delivery:amazon-cloudfront:arch-networking-content-delivery-32-arch-amazon-cloudfront-32-svg";
const ALB_ICON_ID = "aws:service:networking-content-delivery:elastic-load-balancing:arch-networking-content-delivery-32-arch-elastic-load-balancing-32-svg";
const DYNAMODB_ICON_ID = "aws:service:databases:amazon-dynamodb:arch-databases-32-arch-amazon-dynamodb-32-svg";
const SQS_ICON_ID = "aws:service:application-integration:amazon-simple-queue-service:arch-application-integration-32-arch-amazon-simple-queue-service-32-svg";
const SNS_ICON_ID = "aws:service:application-integration:amazon-simple-notification-service:arch-application-integration-32-arch-amazon-simple-notification-service-32-svg";
const EVENTBRIDGE_ICON_ID = "aws:service:application-integration:amazon-eventbridge:arch-application-integration-32-arch-amazon-eventbridge-32-svg";
const ECS_ICON_ID = "aws:service:containers:amazon-elastic-container-service:arch-containers-32-arch-amazon-elastic-container-service-32-svg";
const EKS_ICON_ID = "aws:service:containers:amazon-elastic-kubernetes-service:arch-containers-32-arch-amazon-elastic-kubernetes-service-32-svg";
const VPC_ICON_ID = "aws:service:networking-content-delivery:amazon-virtual-private-cloud:arch-networking-content-delivery-32-arch-amazon-virtual-private-cloud-32-svg";

export const awsResourceDefinitions = [
  {
    id: "aws:ec2",
    provider: "aws",
    service: "EC2",
    resourceType: "compute-instance",
    displayName: "Amazon EC2",
    iconId: EC2_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "EC2 Instance" },
      {
        key: "instanceType",
        label: "Instance Type",
        type: "select",
        defaultValue: "t3.micro",
        options: ["t3.micro", "t3.small", "t3.medium", "t3.large"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:s3",
    provider: "aws",
    service: "S3",
    resourceType: "storage-bucket",
    displayName: "Amazon S3",
    iconId: S3_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "S3 Bucket" },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:lambda",
    provider: "aws",
    service: "Lambda",
    resourceType: "function",
    displayName: "AWS Lambda",
    iconId: LAMBDA_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "Lambda Function" },
      {
        key: "runtime",
        label: "Runtime",
        type: "select",
        defaultValue: "nodejs22.x",
        options: ["nodejs22.x", "nodejs20.x", "python3.13", "python3.12", "java21"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:rds",
    provider: "aws",
    service: "RDS",
    resourceType: "database-instance",
    displayName: "Amazon RDS",
    iconId: RDS_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "RDS Database" },
      {
        key: "engine",
        label: "Engine",
        type: "select",
        defaultValue: "postgres",
        options: ["postgres", "mysql", "mariadb", "aurora-postgresql", "aurora-mysql"],
      },
      {
        key: "instanceClass",
        label: "Instance Class",
        type: "select",
        defaultValue: "db.t3.micro",
        options: ["db.t3.micro", "db.t3.small", "db.t4g.micro", "db.m6g.large"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },

  {
    id: "aws:api-gateway",
    provider: "aws",
    service: "API Gateway",
    resourceType: "api",
    displayName: "Amazon API Gateway",
    iconId: API_GATEWAY_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "API Gateway" },
      {
        key: "apiType",
        label: "API Type",
        type: "select",
        defaultValue: "HTTP",
        options: ["HTTP", "REST", "WebSocket"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:cloudfront",
    provider: "aws",
    service: "CloudFront",
    resourceType: "distribution",
    displayName: "Amazon CloudFront",
    iconId: CLOUDFRONT_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "CloudFront Distribution" },
      {
        key: "distributionType",
        label: "Distribution Type",
        type: "select",
        defaultValue: "Standard",
        options: ["Standard", "Multi-tenant"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "Global",
        options: ["Global"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:alb",
    provider: "aws",
    service: "Elastic Load Balancing",
    resourceType: "application-load-balancer",
    displayName: "Application Load Balancer",
    iconId: ALB_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "Application Load Balancer" },
      {
        key: "scheme",
        label: "Scheme",
        type: "select",
        defaultValue: "internet-facing",
        options: ["internet-facing", "internal"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:dynamodb",
    provider: "aws",
    service: "DynamoDB",
    resourceType: "table",
    displayName: "Amazon DynamoDB",
    iconId: DYNAMODB_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "DynamoDB Table" },
      {
        key: "billingMode",
        label: "Billing Mode",
        type: "select",
        defaultValue: "PAY_PER_REQUEST",
        options: ["PAY_PER_REQUEST", "PROVISIONED"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:sqs",
    provider: "aws",
    service: "SQS",
    resourceType: "queue",
    displayName: "Amazon SQS",
    iconId: SQS_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "SQS Queue" },
      {
        key: "queueType",
        label: "Queue Type",
        type: "select",
        defaultValue: "Standard",
        options: ["Standard", "FIFO"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:sns",
    provider: "aws",
    service: "SNS",
    resourceType: "topic",
    displayName: "Amazon SNS",
    iconId: SNS_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "SNS Topic" },
      {
        key: "topicType",
        label: "Topic Type",
        type: "select",
        defaultValue: "Standard",
        options: ["Standard", "FIFO"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:eventbridge",
    provider: "aws",
    service: "EventBridge",
    resourceType: "event-bus",
    displayName: "Amazon EventBridge",
    iconId: EVENTBRIDGE_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "EventBridge Bus" },
      {
        key: "eventBusType",
        label: "Event Bus Type",
        type: "select",
        defaultValue: "Default",
        options: ["Default", "Custom"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:ecs",
    provider: "aws",
    service: "ECS",
    resourceType: "container-service",
    displayName: "Amazon ECS",
    iconId: ECS_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "ECS Service" },
      {
        key: "launchType",
        label: "Launch Type",
        type: "select",
        defaultValue: "Fargate",
        options: ["Fargate", "EC2"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:eks",
    provider: "aws",
    service: "EKS",
    resourceType: "kubernetes-cluster",
    displayName: "Amazon EKS",
    iconId: EKS_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "EKS Cluster" },
      {
        key: "kubernetesVersion",
        label: "Kubernetes Version",
        type: "select",
        defaultValue: "1.36",
        options: ["1.36", "1.35", "1.34", "1.33"],
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "aws:vpc",
    provider: "aws",
    service: "VPC",
    resourceType: "virtual-network",
    displayName: "Amazon VPC",
    iconId: VPC_ICON_ID,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "VPC" },
      {
        key: "cidrBlock",
        label: "CIDR Block",
        type: "text",
        defaultValue: "10.0.0.0/16",
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        defaultValue: "ap-south-1",
        options: ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1"],
      },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        defaultValue: "development",
        options: ["development", "staging", "production"],
      },
    ],
  },
];

export const awsResourceDefinitionsById = Object.fromEntries(
  awsResourceDefinitions.map((definition) => [definition.id, definition]),
);

export const awsResourceDefinitionsByIconId = Object.fromEntries(
  awsResourceDefinitions.map((definition) => [definition.iconId, definition]),
);

export function getAwsResourceDefinitionForIcon(icon) {
  if (!icon || icon.source !== "aws") return null;
  return awsResourceDefinitionsByIconId[icon.id] || null;
}

export function getAwsResourceDefinitionById(id) {
  return id ? awsResourceDefinitionsById[id] || null : null;
}

export function getAwsResourceDefaults(definition) {
  if (!definition) return {};
  return Object.fromEntries(
    definition.properties.map((property) => [property.key, property.defaultValue]),
  );
}
