"""Paginator utilities."""


def paginate(items: list, page_size: int) -> list[list]:
    pages = []
    for i in range(0, len(items), page_size):
        pages.append(items[i : i + page_size])
    return pages