from fastapi import HTTPException


def raise_http_error(status_code: int, message: str) -> None:
    """Raise HTTPException with a plain string detail (default FastAPI error JSON)."""
    raise HTTPException(status_code=status_code, detail=message)
