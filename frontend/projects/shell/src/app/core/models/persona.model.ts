export interface UserPersona {
  id: string;
  name: string;
  role: string;
  roles: string[];
  department: string;
  avatarColor: string;
}

export const PRECONFIGURED_PERSONAS: UserPersona[] = [
  {
    id: 'usr_ashish_01',
    name: 'Ashish Reddy',
    role: 'Employee / Requester',
    roles: ['ROLE_EMPLOYEE'],
    department: 'Procurement Operations',
    avatarColor: 'bg-blue-600'
  },
  {
    id: 'legal_counsel_meera',
    name: 'Meera Sharma',
    role: 'Legal Counsel',
    roles: ['ROLE_LEGAL_COUNSEL', 'ROLE_EMPLOYEE'],
    department: 'Corporate Legal & Compliance',
    avatarColor: 'bg-purple-600'
  },
  {
    id: 'usr_rahul_finance',
    name: 'Rahul Verma',
    role: 'Finance Manager',
    roles: ['ROLE_FINANCE_APPROVER', 'ROLE_EMPLOYEE'],
    department: 'Finance & Treasury',
    avatarColor: 'bg-emerald-600'
  },
  {
    id: 'usr_admin_system',
    name: 'Platform Administrator',
    role: 'System Admin',
    roles: ['ROLE_ADMIN', 'ROLE_EMPLOYEE'],
    department: 'IT Architecture & SecOps',
    avatarColor: 'bg-rose-600'
  }
];

export interface DevTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: string;
}
