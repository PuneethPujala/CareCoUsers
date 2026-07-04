# 🔐 Authentication Flow Architecture

CareMyMed uses a high-security, **dual-token architecture** designed to support both native high-performance JWT verification and external OAuth providers (specifically Supabase Auth/Google Sign-In) to manage patient and provider profiles.

---

## Technical Overview

The authentication pipeline coordinates client-side request interceptors (`users-mobile/src/lib/api.js`) and backend token middlewares (`users-backend/src/middleware/authenticate.js`).

1. **CareMyMed JWT (Primary)**:
   * **Access Token**: Short-lived (15 minutes), signed with `JWT_ACCESS_SECRET`, passed in the HTTP `Authorization: Bearer <token>` header. Contains user profiles, organization limits, and user type (`patient` or `staff`).
   * **Refresh Token**: Opaque, long-lived token stored hashed in MongoDB and cached in Redis. Accessed via a secure HTTP-only cookie.
2. **Supabase Auth (Fallback/Legacy)**:
   * Used as an OAuth wrapper for Google Sign-In on mobile devices.
   * If `AUTH_ENABLE_SUPABASE_FALLBACK=true`, the backend decodes the Supabase token to match or automatically migrate patient profiles inside our MongoDB.

---

## Authentication Sequence Flowchart

The diagram below details the auth workflow from client requests to backend middleware resolution:

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Mobile Patient Client
    participant ClientAPI as Client API Interceptor (api.js)
    participant Backend as Express Backend Gateway
    participant DB as MongoDB / Redis Database

    %% Normal Request
    Patient->>ClientAPI: Trigger API Call (e.g. GET /dashboard)
    alt Token Expiry Check (<90s remaining)
        ClientAPI->>Backend: POST /api/auth/refresh (Secure Cookie)
        Backend->>DB: Check Redis Session & Verify Hash
        DB-->>Backend: Valid Session Status
        Backend-->>ClientAPI: Return New Access Token & Cookie
    end
    ClientAPI->>Backend: Request with Authorization: Bearer <Access_Token>

    %% Backend Authentication Processing
    Backend->>Backend: Run authenticateSession Middleware
    alt Header starts with Bearer
        Backend->>Backend: Decode CareMyMed JWT
        alt Valid JWT Signature
            Backend->>DB: Fetch req.profile (Patient or Profile)
            DB-->>Backend: Return User Doc
            Backend-->>Patient: 200 OK (Process Dashboard Data)
        else Stale/Invalid Signature & Fallback Enabled
            Backend->>Backend: Fallback to Supabase Auth Token
            Backend->>Backend: Verify Supabase Signature using Anon Key
            alt Valid Supabase Token
                Backend->>DB: Find/Create Patient Profile using UID
                DB-->>Backend: Return Profile Doc
                Backend-->>Patient: 200 OK (Proceed to Dashboard)
            else Invalid / Expired Supabase Token
                Backend-->>Patient: 401 Unauthorized (Force App Logout)
            end
        end
    else No Token Found
        Backend-->>Patient: 401 Unauthorized
    end
```

---

## Client-Side Request Interceptor Details

To prevent race conditions during simultaneous API calls when a token expires, the client-side `api.js` Axios instance queues outgoing requests during refresh cycles:

```mermaid
flowchart TD
    A[Start API Request] --> B{Access Token Expired or expiring in <90s?}
    B -- Yes --> C{Is Refresh already in progress?}
    C -- Yes --> D[Queue Request into pendingQueue]
    C -- No --> E[Set isRefreshing = true]
    E --> F[Call POST /api/auth/refresh]
    F --> G{Refresh Successful?}
    G -- Yes --> H[Update Access Token & Storage]
    H --> I[Flush pendingQueue with new Token]
    I --> J[Release isRefreshing = false]
    J --> K[Execute Request]
    G -- No --> L[Clear Sessions & Redirect to Login]
    
    B -- No --> K
```

---

## Security Implementation Rules

1. **Token Storage**: On mobile clients, all sensitive tokens and refresh keys must be written to `expo-secure-store` or `react-native-encrypted-storage` rather than raw `AsyncStorage` to prevent reverse-engineering extraction.
2. **Session Validity Checks**: The backend enforces `tokenService.checkRedisSessionValidity` on every request to immediately invalidate compromised sessions upon logout or credential reset.
