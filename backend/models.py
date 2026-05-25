from typing import List, Optional
from pydantic import BaseModel, Field, EmailStr


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: str  # cedente | reasegurador | broker


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CompanyIn(BaseModel):
    name: str
    tax_id: str
    country: str
    address: str
    corporate_email: EmailStr
    phone: str
    legal_rep_name: str
    legal_rep_id: str
    legal_rep_role: str
    rating_agency: Optional[str] = None
    rating_value: Optional[str] = None
    licenses: Optional[List[dict]] = None


class SubmissionPackIn(BaseModel):
    title: str
    branch: str
    reinsurance_type: str
    country_region: Optional[str] = ""
    coverage_period: Optional[str] = ""
    cession_pct: Optional[float] = 0
    broker_id: Optional[str] = None
    premiums_y1: Optional[float] = 0
    premiums_y2: Optional[float] = 0
    premiums_y3: Optional[float] = 0
    loss_ratio_y1: Optional[float] = 0
    loss_ratio_y2: Optional[float] = 0
    loss_ratio_y3: Optional[float] = 0
    description: Optional[str] = ""
    status: Optional[str] = "draft"


class InterestIn(BaseModel):
    pack_id: str
    message: Optional[str] = ""


class NcaSignIn(BaseModel):
    operation_id: str
    signer_name: str
    accepted: bool


class QuoteIn(BaseModel):
    operation_id: str
    reinsurance_type: str
    offered_share_pct: float
    ceding_commission_pct: Optional[float] = 0
    rate_on_line_pct: Optional[float] = 0
    attachment_point: Optional[float] = 0
    limit_eur: Optional[float] = 0
    estimated_premium_eur: Optional[float] = 0
    profit_commission_pct: Optional[float] = 0
    sliding_scale: Optional[bool] = False
    sliding_min: Optional[float] = 0
    sliding_max: Optional[float] = 0
    exclusions: Optional[str] = ""
    special_conditions: Optional[str] = ""
    expiry_date: Optional[str] = ""


class MessageIn(BaseModel):
    operation_id: str
    channel: str  # broker-cedente | broker-reasegurador | cedente-reasegurador
    text: str


class BrokerProfileIn(BaseModel):
    visible_in_marketplace: Optional[bool] = False
    availability: Optional[str] = "available"
    bio: Optional[str] = ""
    founded_year: Optional[int] = None
    team_size: Optional[str] = ""
    branches: Optional[List[str]] = []
    services_cedentes: Optional[List[str]] = []
    services_reaseguradores: Optional[List[str]] = []
    geographic_zones: Optional[List[str]] = []
    program_range_min: Optional[float] = 0
    program_range_max: Optional[float] = 0
    languages: Optional[List[str]] = []
    linkedin_url: Optional[str] = ""
    website_url: Optional[str] = ""


class SolicitudIn(BaseModel):
    broker_id: str
    service: str
    program_type: Optional[str] = ""
    volume_eur: Optional[float] = 0
    geographic_zone: Optional[str] = ""
    message: Optional[str] = ""
    pack_id: Optional[str] = None
    pack_code: Optional[str] = None


class BrokerPackOfferIn(BaseModel):
    message: Optional[str] = ""


class RatingIn(BaseModel):
    operation_id: str
    broker_id: str
    technical: int
    communication: int
    deadlines: int


class CedenteProfileIn(BaseModel):
    bio: Optional[str] = ""
    branches: Optional[List[str]] = []
    geographic_zones: Optional[List[str]] = []
    languages: Optional[List[str]] = []
    linkedin_url: Optional[str] = ""
    website_url: Optional[str] = ""


class ReaseguradorProfileIn(BaseModel):
    bio: Optional[str] = ""
    branches: Optional[List[str]] = []
    geographic_zones: Optional[List[str]] = []
    languages: Optional[List[str]] = []
    linkedin_url: Optional[str] = ""
    website_url: Optional[str] = ""


class AdminVerifyIn(BaseModel):
    company_id: str
    verified: bool
