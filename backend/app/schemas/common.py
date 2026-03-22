from pydantic import BaseModel, Field


class SuccessResponse(BaseModel):
    """Standard JSON body for successful operations that only need a message."""

    success: bool = Field(default=True, description="Always true")
    message: str = Field(..., description="Human-readable success message")


class ForgotPasswordSuccessResponse(SuccessResponse):
    """Forgot-password success; in dev, reset_token may be included for testing."""

    reset_token: str | None = Field(default=None, description="Only in dev when email exists")
    expires_in_hours: int | None = Field(default=None, description="Reset token lifetime (dev)")


class ErrorBody(BaseModel):
    """Documented shape for error payloads (FastAPI still uses `detail` on HTTPException)."""

    success: bool = Field(default=False)
    message: str = Field(..., description="Error description")
    code: str | None = Field(default=None, description="Optional machine-readable code")
