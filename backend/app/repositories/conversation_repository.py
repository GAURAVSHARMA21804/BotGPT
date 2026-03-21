from sqlalchemy.orm import Session


class ConversationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def save_message(self, user_id: str, message: str, role: str) -> None:
        # Placeholder for DB persistence logic.
        _ = (user_id, message, role)
