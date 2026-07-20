# GreenStay on Kubernetes

Kubernetes manifests migrating the four docker-compose services to a
cluster deployment, plus a Prometheus/Grafana monitoring stack.

```
                        ┌──────────────────────────── namespace: greenstay ─┐
  Internet ──▶ Ingress ─┤                                                   │
                        │  frontend (nginx+React, 2 replicas)               │
                        │      │ /api                                       │
                        │      ▼                                            │
                        │  backend (Flask/gunicorn, 2 replicas, HPA 2–5)    │
                        │      │ push email jobs                            │
                        │      ▼                                            │
                        │  AWS SQS ◀── worker (SQS consumer, 1 replica) ──▶ AWS SES
                        └───────────────────────────────────────────────────┘
                        ┌──────────────────────────── namespace: monitoring ┐
                        │  Prometheus ──▶ scrapes backend /metrics          │
                        │  Grafana    ──▶ GreenStay dashboard (provisioned) │
                        └───────────────────────────────────────────────────┘
```

## Layout

| Path | What |
|---|---|
| `namespace.yaml` | `greenstay` namespace |
| `configmap.yaml` | non-secret app config (AWS region, sender address) |
| `secret.example.yaml` | template for AWS credentials — copy to `secret.yaml` (gitignored), never commit real keys |
| `backend.yaml` | Flask API Deployment (2 replicas, probes, resource limits) + Service |
| `frontend.yaml` | nginx+React Deployment (2 replicas) + Service |
| `worker.yaml` | SQS consumer Deployment — the in-cluster equivalent of the Lambda consumer, for clusters where email draining should run as a pod |
| `hpa.yaml` | HorizontalPodAutoscaler for the backend (CPU-based, 2–5 replicas) |
| `ingress.yaml` | single host routing `/` → frontend, `/api` → backend |
| `monitoring/` | Prometheus + Grafana with a provisioned GreenStay dashboard |
| `kustomization.yaml` | `kubectl apply -k k8s/` applies the whole app |

## Run (minikube)

```bash
# build images into the minikube docker daemon
eval $(minikube docker-env)
docker build -t greenstay-app-backend:latest  -f DevOps/Dockerfile.backend .
docker build -t greenstay-app-frontend:latest -f DevOps/Dockerfile.frontend .

# credentials (never committed)
cp k8s/secret.example.yaml k8s/secret.yaml   # then fill in values
kubectl apply -f k8s/secret.yaml

# app + monitoring
kubectl apply -k k8s/
kubectl apply -k k8s/monitoring/

minikube service frontend -n greenstay
```

On EKS the same manifests apply unchanged; swap the Secret for IRSA
(IAM Roles for Service Accounts) and drop the static keys entirely.
