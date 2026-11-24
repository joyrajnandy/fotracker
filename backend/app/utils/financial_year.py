from datetime import date


def get_financial_year(d: date) -> str:
    """Returns Indian financial year string like '2026-27'."""
    if d.month >= 4:
        return f"{d.year}-{str(d.year + 1)[-2:]}"
    else:
        return f"{d.year - 1}-{str(d.year)[-2:]}"


def get_current_financial_year() -> str:
    return get_financial_year(date.today())


def get_financial_year_dates(fy: str):
    """Returns (start_date, end_date) for a financial year string like '2026-27'."""
    start_year = int(fy.split("-")[0])
    return date(start_year, 4, 1), date(start_year + 1, 3, 31)


def get_available_financial_years(advance_years: int = 4) -> list:
    """Returns current financial year plus 4 advance financial years (no prior years)."""
    today = date.today()
    current_start = today.year if today.month >= 4 else today.year - 1
    return [
        f"{y}-{str(y + 1)[-2:]}"
        for y in range(current_start, current_start + advance_years + 1)
    ]
