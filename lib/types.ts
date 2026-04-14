export type OpportunityStatus = 'pending' | 'published' | 'rejected' | 'dismissed'
export type VerificationStatus = 'unverified' | 'verified' | 'needs_review'
export type CostType = 'free' | 'paid' | 'financial_aid_available'
export type LocationType = 'online' | 'in_person' | 'hybrid'
export type OpportunityType =
  | 'competition'
  | 'program'
  | 'internship'
  | 'scholarship'
  | 'volunteer'
  | 'research'
  | 'workshop'
  | 'other'

export const OPPORTUNITY_TYPES: Record<OpportunityType, string> = {
  competition: 'Competition',
  program: 'Program',
  internship: 'Internship',
  scholarship: 'Scholarship',
  volunteer: 'Volunteer',
  research: 'Research',
  workshop: 'Workshop',
  other: 'Other',
}

export const FIELDS = [
  'STEM',
  'Leadership',
  'Journalism',
  'Arts',
  'Business',
  'Community Service',
  'Environment',
  'Medicine',
  'Law',
  'Technology',
  'College Prep',
  'Social Justice',
]

export const GRADE_LEVELS = ['9', '10', '11', '12']

export interface Opportunity {
  id: string
  title: string
  description: string | null
  organization: string | null
  website_url: string | null
  type: OpportunityType
  fields: string[]
  grade_levels: string[]
  cost: CostType
  cost_amount: string | null
  location_type: LocationType
  location: string | null
  requirements: string | null
  deadline: string | null
  start_date: string | null
  end_date: string | null
  duration: string | null
  status: OpportunityStatus
  ai_notes: string | null
  search_keywords: string[]
  last_verified_at: string | null
  verification_status: VerificationStatus
  verification_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
}

export interface Admin {
  id: string
  username: string
  display_name: string | null
  created_at: string
}
