# Kubernetes

This fork ships no Helm chart of its own.

Upstream's `plane-ce` chart ([makeplane/helm-charts](https://github.com/makeplane/helm-charts), published on [Artifact Hub](https://artifacthub.io/packages/helm/makeplane/plane-ce)) is upstream's code: this fork neither controls nor tracks it, and out of the box it deploys upstream's images. To run this fork with it, override the image of every Plane service and pin the version to one of this fork's releases:

```yaml
# values-gelhaus.yaml
planeVersion: v1.4.3 # a release tag of Gelhaus-Solutions/plane

web:
  image: ghcr.io/gelhaus-solutions/plane-frontend
space:
  image: ghcr.io/gelhaus-solutions/plane-space
admin:
  image: ghcr.io/gelhaus-solutions/plane-admin
live:
  image: ghcr.io/gelhaus-solutions/plane-live
api:
  image: ghcr.io/gelhaus-solutions/plane-backend
worker:
  image: ghcr.io/gelhaus-solutions/plane-backend
beatworker:
  image: ghcr.io/gelhaus-solutions/plane-backend
```

```bash
helm repo add makeplane https://helm.plane.so/
helm install plane-app makeplane/plane-ce --version 1.8.5 -n plane --create-namespace -f values-gelhaus.yaml
```

Chart 1.8.5 is the one built for upstream 1.4.2, the version this fork split from. On every chart upgrade, compare its values and templates with what this fork's images expect: the chart follows upstream, not this fork, and a newer chart may set environment variables or run steps the fork's code does not have.
