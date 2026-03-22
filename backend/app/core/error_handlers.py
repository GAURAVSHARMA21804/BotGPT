import logging
import traceback

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings

logger = logging.getLogger("app.errors")


def register_exception_handlers(app: FastAPI) -> None:
    def server_error_body() -> dict[str, str]:
        msg = "An unexpected error occurred. Please try again later."
        if settings.app_env == "dev":
            msg = "Internal server error (see server logs for details in dev)."
        return {"detail": msg}

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_exception_handler(
        request: Request, exc: SQLAlchemyError
    ) -> JSONResponse:
        logger.error(
            "Database error: %s\n%s",
            exc,
            traceback.format_exc(),
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=server_error_body(),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        # Delegate to Starlette/FastAPI default for HTTPException (more specific
        # handlers are tried first; this catches everything else).
        if isinstance(exc, HTTPException):
            return await http_exception_handler(request, exc)
        if isinstance(exc, RequestValidationError):
            return await request_validation_exception_handler(request, exc)

        logger.error(
            "Unhandled exception: %s\n%s",
            exc,
            traceback.format_exc(),
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=server_error_body(),
        )
