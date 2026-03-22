import re

import tiktoken


def get_encoder():
    return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(get_encoder().encode(text))


def chunk_text_recursive(
    text: str,
    max_tokens: int = 512,
    overlap_tokens: int = 64,
) -> list[tuple[str, int]]:
    """Split into overlapping windows; prefers paragraph boundaries then sentences."""
    text = text.strip()
    if not text:
        return []

    enc = get_encoder()
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    chunks: list[str] = []
    buf: list[str] = []
    buf_tokens = 0

    def flush_buf() -> None:
        nonlocal buf, buf_tokens
        if buf:
            chunks.append("\n\n".join(buf))
            buf = []
            buf_tokens = 0

    for para in paragraphs:
        ptoks = len(enc.encode(para))
        if ptoks > max_tokens:
            flush_buf()
            start = 0
            ids = enc.encode(para)
            while start < len(ids):
                end = min(start + max_tokens, len(ids))
                piece = enc.decode(ids[start:end])
                chunks.append(piece)
                if end >= len(ids):
                    break
                start = max(0, end - overlap_tokens)
            continue

        if buf_tokens + ptoks > max_tokens and buf:
            flush_buf()
        buf.append(para)
        buf_tokens += ptoks
        if buf_tokens >= max_tokens:
            flush_buf()

    flush_buf()

    merged: list[tuple[str, int]] = []
    for i, c in enumerate(chunks):
        toks = count_tokens(c)
        if i > 0 and toks < overlap_tokens and merged:
            prev, pt = merged[-1]
            if count_tokens(prev + "\n" + c) <= max_tokens + overlap_tokens:
                merged[-1] = (prev + "\n" + c, count_tokens(prev + "\n" + c))
                continue
        merged.append((c, toks))
    return merged
