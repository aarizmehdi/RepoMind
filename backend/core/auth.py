"""
Firebase Admin Auth Middleware
Verifies Firebase ID tokens from the Authorization: Bearer <token> header.
Attaches decoded user info to the request state.
"""

import os
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Initialize Firebase Admin SDK once at module load.
# core/auth.py lives at backend/core/auth.py
# firebase-admin.json lives at backend/firebase-admin.json
_SERVICE_ACCOUNT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "firebase-admin.json",
)

if not firebase_admin._apps:
    cred = credentials.Certificate(os.path.abspath(_SERVICE_ACCOUNT_PATH))
    firebase_admin.initialize_app(cred)

_bearer_scheme = HTTPBearer()


async def verify_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> dict:
    """
    FastAPI dependency that validates a Firebase ID token.

    Returns the decoded token payload (contains uid, email, etc.).
    Raises HTTP 401 on any failure.
    """
    token = credentials.credentials
    try:
        decoded_token: dict = auth.verify_id_token(token, check_revoked=True)
    except auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Token has been revoked.")
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token has expired.")
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(exc)}")

    # Attach user info to request state for downstream handlers.
    request.state.user = decoded_token
    return decoded_token
