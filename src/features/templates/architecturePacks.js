/**
 * Curated Architecture Starter Templates for Sketchizi
 * Ready-to-use system design and cloud architecture diagrams
 */

export const ARCHITECTURE_PACKS = [
  {
    id: "aws-3tier",
    title: "AWS 3-Tier Web Application",
    category: "Cloud Architecture",
    description: "Highly available 3-tier architecture with Route 53, ALB, ECS auto-scaling containers, Aurora PostgreSQL, and Redis cache.",
    badge: "AWS",
    elements: [
      { id: "box-vpc", type: "rectangle", x: 100, y: 100, width: 840, height: 480, strokeColor: "#3b82f6", backgroundColor: "transparent", fillStyle: "dashed", strokeWidth: 2, roughness: 0 },
      { id: "lbl-vpc", type: "text", x: 120, y: 115, width: 140, height: 24, text: "VPC (10.0.0.0/16)", fontSize: 16, strokeColor: "#60a5fa" },
      { id: "box-r53", type: "rectangle", x: 140, y: 180, width: 130, height: 70, strokeColor: "#e11d48", backgroundColor: "#ffe4e6", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-r53", type: "text", x: 155, y: 205, width: 100, height: 20, text: "Route 53 DNS", fontSize: 14, strokeColor: "#9f1239" },
      { id: "box-alb", type: "rectangle", x: 330, y: 180, width: 140, height: 70, strokeColor: "#d97706", backgroundColor: "#fef3c7", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-alb", type: "text", x: 345, y: 205, width: 110, height: 20, text: "Application LB", fontSize: 14, strokeColor: "#92400e" },
      { id: "box-ecs", type: "rectangle", x: 530, y: 160, width: 160, height: 110, strokeColor: "#2563eb", backgroundColor: "#dbeafe", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-ecs", type: "text", x: 545, y: 195, width: 130, height: 40, text: "ECS Fargate Cluster\n(Auto-Scaling)", fontSize: 13, strokeColor: "#1e40af" },
      { id: "box-db", type: "rectangle", x: 740, y: 160, width: 160, height: 110, strokeColor: "#059669", backgroundColor: "#d1fae5", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-db", type: "text", x: 755, y: 195, width: 130, height: 40, text: "Aurora PostgreSQL\n(Multi-AZ Cluster)", fontSize: 13, strokeColor: "#065f46" },
      { id: "box-cache", type: "rectangle", x: 530, y: 330, width: 160, height: 80, strokeColor: "#7c3aed", backgroundColor: "#ede9fe", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-cache", type: "text", x: 545, y: 360, width: 130, height: 20, text: "ElastiCache Redis", fontSize: 13, strokeColor: "#5b21b6" },
      // Connectors
      { id: "arr-1", type: "arrow", x: 270, y: 215, width: 60, height: 0, points: [[0, 0], [60, 0]], strokeColor: "#94a3b8", strokeWidth: 2 },
      { id: "arr-2", type: "arrow", x: 470, y: 215, width: 60, height: 0, points: [[0, 0], [60, 0]], strokeColor: "#94a3b8", strokeWidth: 2 },
      { id: "arr-3", type: "arrow", x: 690, y: 215, width: 50, height: 0, points: [[0, 0], [50, 0]], strokeColor: "#94a3b8", strokeWidth: 2 },
      { id: "arr-4", type: "arrow", x: 610, y: 270, width: 0, height: 60, points: [[0, 0], [0, 60]], strokeColor: "#94a3b8", strokeWidth: 2 }
    ]
  },
  {
    id: "event-driven",
    title: "Event-Driven Microservices",
    category: "System Design",
    description: "Decoupled async architecture using Apache Kafka message streaming between producer and consumer services.",
    badge: "Kafka",
    elements: [
      { id: "box-gw", type: "rectangle", x: 100, y: 180, width: 140, height: 80, strokeColor: "#2563eb", backgroundColor: "#dbeafe", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-gw", type: "text", x: 115, y: 210, width: 110, height: 20, text: "API Gateway", fontSize: 14, strokeColor: "#1e40af" },
      { id: "box-order", type: "rectangle", x: 300, y: 180, width: 150, height: 80, strokeColor: "#059669", backgroundColor: "#d1fae5", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-order", type: "text", x: 315, y: 210, width: 120, height: 20, text: "Order Service", fontSize: 14, strokeColor: "#065f46" },
      { id: "box-kafka", type: "rectangle", x: 510, y: 120, width: 170, height: 200, strokeColor: "#ea580c", backgroundColor: "#ffedd5", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-kafka", type: "text", x: 525, y: 140, width: 140, height: 40, text: "Apache Kafka\nEvent Broker", fontSize: 15, strokeColor: "#9a3412" },
      { id: "box-pay", type: "rectangle", x: 740, y: 130, width: 160, height: 75, strokeColor: "#7c3aed", backgroundColor: "#ede9fe", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-pay", type: "text", x: 755, y: 155, width: 130, height: 20, text: "Payment Consumer", fontSize: 13, strokeColor: "#5b21b6" },
      { id: "box-inv", type: "rectangle", x: 740, y: 240, width: 160, height: 75, strokeColor: "#0891b2", backgroundColor: "#cffafe", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-inv", type: "text", x: 755, y: 265, width: 130, height: 20, text: "Inventory Consumer", fontSize: 13, strokeColor: "#155e75" },
      // Connectors
      { id: "arr-e1", type: "arrow", x: 240, y: 220, width: 60, height: 0, points: [[0, 0], [60, 0]], strokeColor: "#94a3b8", strokeWidth: 2 },
      { id: "arr-e2", type: "arrow", x: 450, y: 220, width: 60, height: 0, points: [[0, 0], [60, 0]], strokeColor: "#94a3b8", strokeWidth: 2 },
      { id: "arr-e3", type: "arrow", x: 680, y: 170, width: 60, height: 0, points: [[0, 0], [60, 0]], strokeColor: "#94a3b8", strokeWidth: 2 },
      { id: "arr-e4", type: "arrow", x: 680, y: 275, width: 60, height: 0, points: [[0, 0], [60, 0]], strokeColor: "#94a3b8", strokeWidth: 2 }
    ]
  },
  {
    id: "k8s-cluster",
    title: "Kubernetes Production Cluster",
    category: "Container Orchestration",
    description: "Production Kubernetes layout with Ingress NGINX, ClusterIP Services, ReplicaSet Pods, and Persistent Volumes.",
    badge: "K8s",
    elements: [
      { id: "box-cluster", type: "rectangle", x: 120, y: 100, width: 780, height: 420, strokeColor: "#326ce5", backgroundColor: "transparent", fillStyle: "dashed", strokeWidth: 2, roughness: 0 },
      { id: "txt-cluster", type: "text", x: 140, y: 115, width: 180, height: 24, text: "Kubernetes Cluster", fontSize: 16, strokeColor: "#326ce5" },
      { id: "box-ing", type: "rectangle", x: 160, y: 180, width: 140, height: 80, strokeColor: "#326ce5", backgroundColor: "#e0e7ff", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-ing", type: "text", x: 175, y: 210, width: 110, height: 20, text: "Ingress NGINX", fontSize: 14, strokeColor: "#1e3a8a" },
      { id: "box-svc", type: "rectangle", x: 360, y: 180, width: 140, height: 80, strokeColor: "#059669", backgroundColor: "#d1fae5", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-svc", type: "text", x: 375, y: 210, width: 110, height: 20, text: "ClusterIP Svc", fontSize: 14, strokeColor: "#065f46" },
      { id: "box-pods", type: "rectangle", x: 560, y: 160, width: 150, height: 120, strokeColor: "#d97706", backgroundColor: "#fef3c7", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-pods", type: "text", x: 575, y: 200, width: 120, height: 40, text: "Deployment Pods\n(3 Replicas)", fontSize: 13, strokeColor: "#92400e" },
      { id: "box-pvc", type: "rectangle", x: 750, y: 180, width: 130, height: 80, strokeColor: "#7c3aed", backgroundColor: "#ede9fe", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-pvc", type: "text", x: 765, y: 210, width: 100, height: 20, text: "Storage PVC", fontSize: 13, strokeColor: "#5b21b6" },
      // Connectors
      { id: "arr-k1", type: "arrow", x: 300, y: 220, width: 60, height: 0, points: [[0, 0], [60, 0]], strokeColor: "#94a3b8", strokeWidth: 2 },
      { id: "arr-k2", type: "arrow", x: 500, y: 220, width: 60, height: 0, points: [[0, 0], [60, 0]], strokeColor: "#94a3b8", strokeWidth: 2 },
      { id: "arr-k3", type: "arrow", x: 710, y: 220, width: 40, height: 0, points: [[0, 0], [40, 0]], strokeColor: "#94a3b8", strokeWidth: 2 }
    ]
  },
  {
    id: "interview-framework",
    title: "System Design Interview Board",
    category: "Interview Prep",
    description: "4-Quadrant blueprint for structuring real-time scalability discussions: Scope, API Contracts, Architecture, and Deep-Dive.",
    badge: "Framework",
    elements: [
      { id: "quad-1", type: "rectangle", x: 100, y: 100, width: 400, height: 240, strokeColor: "#3b82f6", backgroundColor: "#f0f9ff", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-q1", type: "text", x: 120, y: 120, width: 360, height: 80, text: "1. Scope & Requirements\n• Functional Requirements (FR)\n• Non-Functional (Latency, QPS, DAU)\n• Scale Estimates (Storage / Read-to-Write)", fontSize: 14, strokeColor: "#0369a1" },
      { id: "quad-2", type: "rectangle", x: 530, y: 100, width: 400, height: 240, strokeColor: "#10b981", backgroundColor: "#ecfdf5", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-q2", type: "text", x: 550, y: 120, width: 360, height: 80, text: "2. API Design & Data Model\n• REST / gRPC Endpoints\n• Relational vs Document Schema\n• Partition Key Strategy", fontSize: 14, strokeColor: "#047857" },
      { id: "quad-3", type: "rectangle", x: 100, y: 370, width: 400, height: 240, strokeColor: "#8b5cf6", backgroundColor: "#f5f3ff", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-q3", type: "text", x: 120, y: 390, width: 360, height: 80, text: "3. High-Level Architecture\n• Client -> CDN -> Load Balancer\n• Stateless App Servers\n• Database Write Master + Read Slaves", fontSize: 14, strokeColor: "#6d28d9" },
      { id: "quad-4", type: "rectangle", x: 530, y: 370, width: 400, height: 240, strokeColor: "#f59e0b", backgroundColor: "#fffbeb", fillStyle: "solid", strokeWidth: 2, roughness: 0 },
      { id: "txt-q4", type: "text", x: 550, y: 390, width: 360, height: 80, text: "4. Deep Dive & Bottlenecks\n• Redis Cache Eviction & Invalidation\n• Message Queues (RabbitMQ / SQS)\n• Failover & Disaster Recovery", fontSize: 14, strokeColor: "#b45309" }
    ]
  }
];
