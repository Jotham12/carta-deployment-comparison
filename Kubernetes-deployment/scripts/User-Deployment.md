---

# Alternative: Deploy CARTA Backend Without the Controller

CARTA backend can also be deployed directly on Kubernetes without using the CARTA controller. This approach is useful for testing a single backend instance or for cases where the frontend is configured to connect directly to a backend endpoint using WebSocket communication.

In this mode, Kubernetes runs the CARTA backend as a normal Deployment and exposes it through a Service. The backend mounts the CephFS PVC at `/images`, allowing it to access shared image data. The frontend can then connect to the backend through the exposed service endpoint.

This approach is different from the controller-based deployment. In the controller-based deployment, the CARTA controller handles authentication, session management, and dynamic backend pod creation for users. In this direct backend deployment, the backend pod is created manually using Kubernetes manifests.

---

## Deploy a Standalone CARTA Backend

Create a file called:

```bash
nano carta-backend-standalone.yaml
```

Paste the following content:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: carta
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: carta-backend-a
  namespace: carta
  labels:
    app: carta-backend
    instance: a
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: carta-backend
      instance: a
  template:
    metadata:
      labels:
        app: carta-backend
        instance: a
    spec:
      securityContext:
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        fsGroupChangePolicy: OnRootMismatch
      containers:
        - name: carta-backend
          image: cartavis/carta:beta
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 3002
          volumeMounts:
            - name: carta-storage
              mountPath: /images
          startupProbe:
            tcpSocket:
              port: 3002
            failureThreshold: 30
            periodSeconds: 2
          readinessProbe:
            tcpSocket:
              port: 3002
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            tcpSocket:
              port: 3002
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
      volumes:
        - name: carta-storage
          persistentVolumeClaim:
            claimName: cephfs-images-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: carta-backend-a
  namespace: carta
spec:
  type: NodePort
  selector:
    app: carta-backend
    instance: a
  ports:
    - name: tcp
      port: 3002
      targetPort: 3002
      # Optional fixed NodePort:
      # nodePort: 32002
```

Apply the manifest:

```bash
kubectl apply -f carta-backend-standalone.yaml
```

Verify that the backend pod is running:

```bash
kubectl get pods -n carta
```

Verify the service:

```bash
kubectl get svc -n carta
```

Expected output should include:

```text
carta-backend-a   NodePort   ...   3002:xxxxx/TCP
```

---

## Connect the Frontend to the Backend

The CARTA frontend can connect to the backend using a WebSocket endpoint exposed through the Kubernetes Service.

For local testing, use port forwarding:

```bash
kubectl port-forward -n carta svc/carta-backend-a 3002:3002
```

The backend will then be reachable at:

```text
localhost:3002
```

The frontend should be configured to connect to the backend WebSocket endpoint using the exposed host and port.

If using a NodePort service, get the node IP:

```bash
kubectl get nodes -o wide
```

Then connect using:

```text
<node-ip>:<node-port>
```

For example, if the NodePort is `32002`:

```text
<node-ip>:32002
```

---

## Verify Backend Logs

Check the backend logs:

```bash
kubectl logs -n carta deployment/carta-backend-a
```

Or check the pod directly:

```bash
kubectl get pods -n carta
kubectl logs -n carta <carta-backend-pod-name>
```

---

## Notes

- This standalone backend deployment is mainly useful for testing and development.
- It does not provide the same session management as the CARTA controller.
- It does not dynamically create per-user backend pods.
- It does not provide the same authentication workflow as the controller-based deployment.
- The backend still requires access to the CephFS PVC named `cephfs-images-pvc`.
- The backend exposes port `3002`, which the frontend can use for WebSocket communication.
