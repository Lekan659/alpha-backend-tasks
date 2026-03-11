import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.briefing import (
    BriefingCreate,
    BriefingListItem,
    BriefingRead,
    BriefingUpdate,
    GenerateReportResponse,
)
from app.services.briefing_service import (
    BriefingAlreadyPublishedError,
    BriefingNotFoundError,
    briefing_to_read_schema,
    create_briefing,
    delete_briefing,
    get_briefing_by_id,
    list_briefings,
    publish_briefing,
    update_briefing,
)
from app.services.briefing_formatter import format_briefing_report

router = APIRouter(prefix="/briefings", tags=["briefings"])


def _validate_uuid(briefing_id: str) -> uuid.UUID:
    """Validate and parse a UUID string."""
    try:
        return uuid.UUID(briefing_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid briefing ID format: '{briefing_id}' is not a valid UUID",
        )


@router.post("", response_model=BriefingRead, status_code=status.HTTP_201_CREATED)
def create_new_briefing(
    payload: BriefingCreate,
    db: Annotated[Session, Depends(get_db)],
) -> BriefingRead:
    """
    Create a new briefing report.
    
    Requirements:
    - company_name is required
    - At least 2 key points required
    - At least 1 risk required
    - Metric names must be unique within the briefing
    - Ticker will be uppercased automatically
    """
    briefing = create_briefing(db, payload)
    return briefing_to_read_schema(briefing)


@router.get("", response_model=list[BriefingListItem])
def list_all_briefings(
    db: Annotated[Session, Depends(get_db)],
    limit: int = 50,
    offset: int = 0,
) -> list[BriefingListItem]:
    """List all briefings with pagination."""
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 100",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offset must be non-negative",
        )

    briefings = list_briefings(db, limit=limit, offset=offset)
    return [BriefingListItem.model_validate(b) for b in briefings]


@router.get("/{briefing_id}", response_model=BriefingRead)
def get_briefing(
    briefing_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> BriefingRead:
    """Get a single briefing by ID with all related data."""
    parsed_id = _validate_uuid(briefing_id)
    briefing = get_briefing_by_id(db, parsed_id)

    if briefing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Briefing with id '{briefing_id}' not found",
        )

    return briefing_to_read_schema(briefing)


@router.patch("/{briefing_id}", response_model=BriefingRead)
def update_existing_briefing(
    briefing_id: str,
    payload: BriefingUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> BriefingRead:
    """
    Update an existing briefing.
    
    Only draft briefings can be updated. Published briefings are immutable.
    """
    parsed_id = _validate_uuid(briefing_id)

    try:
        briefing = update_briefing(db, parsed_id, payload)
        return briefing_to_read_schema(briefing)
    except BriefingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Briefing with id '{briefing_id}' not found",
        )
    except BriefingAlreadyPublishedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Briefing '{briefing_id}' is already published and cannot be modified",
        )


@router.delete("/{briefing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_briefing(
    briefing_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Delete a briefing and all its related data."""
    parsed_id = _validate_uuid(briefing_id)

    try:
        delete_briefing(db, parsed_id)
    except BriefingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Briefing with id '{briefing_id}' not found",
        )


@router.post("/{briefing_id}/generate", response_model=GenerateReportResponse)
def generate_report(
    briefing_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> GenerateReportResponse:
    """
    Publish a briefing and mark it ready for HTML rendering.
    
    This transitions the briefing from 'draft' to 'published' status.
    Once published, the briefing cannot be modified.
    """
    parsed_id = _validate_uuid(briefing_id)
    briefing = get_briefing_by_id(db, parsed_id)

    if briefing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Briefing with id '{briefing_id}' not found",
        )

    briefing = publish_briefing(db, parsed_id)

    return GenerateReportResponse(
        message="Report generated successfully",
        briefing_id=briefing.id,
        status=briefing.status,
    )


@router.get("/{briefing_id}/html", response_class=HTMLResponse)
def get_briefing_html(
    briefing_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> HTMLResponse:
    """
    Get the HTML representation of a briefing report.
    
    Returns a professionally formatted HTML document suitable for
    viewing in a browser or printing.
    """
    parsed_id = _validate_uuid(briefing_id)
    briefing = get_briefing_by_id(db, parsed_id)

    if briefing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Briefing with id '{briefing_id}' not found",
        )

    html_content = format_briefing_report(briefing)
    return HTMLResponse(content=html_content)
