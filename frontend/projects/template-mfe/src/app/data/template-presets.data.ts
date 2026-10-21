import { BlueprintPreset } from '../models/template.model';

export const BLUEPRINT_PRESETS: BlueprintPreset[] = [
  {
    id: 'it-procurement',
    name: 'Hardware & IT Procurement',
    badge: 'Standard 4-Stage',
    description: 'Hardware equipment request with IT admin approval and vendor dispatch',
    template: {
      templateKey: 'IT_HARDWARE_PROCUREMENT_V1',
      version: 1,
      name: 'IT Equipment & Hardware Procurement',
      description: 'Employee hardware request with IT approval and procurement fulfillment',
      status: 'DRAFT',
      initialState: 'REQUEST_SUBMISSION',
      steps: {
        REQUEST_SUBMISSION: {
          stepOrder: 1,
          stepName: 'Submit Equipment Request',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredRole: null,
          requiredPayloadKeys: ['deviceModel', 'businessJustification'],
          isTerminal: false,
          slaHours: 24,
          transitions: {
            SUBMIT_REQUEST: 'PENDING_IT_APPROVAL'
          }
        },
        PENDING_IT_APPROVAL: {
          stepOrder: 2,
          stepName: 'IT Operations Approval',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_IT_ADMIN',
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            APPROVE_REQUEST: 'PENDING_PROCUREMENT',
            REJECT_REQUEST: 'REJECTED'
          }
        },
        PENDING_PROCUREMENT: {
          stepOrder: 3,
          stepName: 'Procurement & Dispatch',
          stepType: 'MANUAL_TASK',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_FINANCE_MANAGER',
          requiredPayloadKeys: ['trackingNumber'],
          isTerminal: false,
          slaHours: 72,
          transitions: {
            DISPATCH_ITEM: 'COMPLETED'
          }
        },
        COMPLETED: {
          stepOrder: 4,
          stepName: 'Device Delivered',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 5,
          stepName: 'Request Rejected',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    }
  },
  {
    id: 'capex-approval',
    name: 'CAPEX Capital Expenditure',
    badge: 'Multi-Level Approval',
    description: 'High-value expenditure approval by Department Head and Finance Controller',
    template: {
      templateKey: 'CAPEX_EXPENDITURE_V1',
      version: 1,
      name: 'Capital Expenditure Authorization',
      description: 'Dual-gate financial approval for expenses over $10,000',
      status: 'DRAFT',
      initialState: 'SUBMIT_CAPEX',
      steps: {
        SUBMIT_CAPEX: {
          stepOrder: 1,
          stepName: 'Initiate CAPEX Dossier',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredRole: null,
          requiredPayloadKeys: ['amount', 'vendorName', 'costCenter'],
          isTerminal: false,
          slaHours: 24,
          transitions: {
            SUBMIT_FOR_REVIEW: 'DEPT_HEAD_APPROVAL'
          }
        },
        DEPT_HEAD_APPROVAL: {
          stepOrder: 2,
          stepName: 'Department Head Review',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_EMPLOYEE',
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            APPROVE: 'FINANCE_CONTROLLER_REVIEW',
            REJECT: 'REJECTED'
          }
        },
        FINANCE_CONTROLLER_REVIEW: {
          stepOrder: 3,
          stepName: 'Finance Controller Audit',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_FINANCE_MANAGER',
          requiredPayloadKeys: ['allocatedBudgetCode'],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            AUTHORIZE_DISBURSEMENT: 'FUNDS_DISBURSED',
            REJECT: 'REJECTED'
          }
        },
        FUNDS_DISBURSED: {
          stepOrder: 4,
          stepName: 'Funds Disbursed',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 5,
          stepName: 'CAPEX Denied',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    }
  },
  {
    id: 'vendor-onboarding',
    name: 'Vendor Compliance & SLA',
    badge: 'Legal & Compliance',
    description: 'Vendor document collection, legal audit, and production onboarding',
    template: {
      templateKey: 'ENTERPRISE_VENDOR_ONBOARDING_V1',
      version: 1,
      name: 'Vendor Compliance Onboarding',
      description: 'Vendor compliance verification with legal audit',
      status: 'DRAFT',
      initialState: 'SUBMIT_KYC_DOCS',
      steps: {
        SUBMIT_KYC_DOCS: {
          stepOrder: 1,
          stepName: 'Submit KYC Documents',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredRole: null,
          requiredPayloadKeys: ['taxId', 'corporateRegistration'],
          isTerminal: false,
          slaHours: 24,
          transitions: {
            SUBMIT: 'LEGAL_COMPLIANCE_REVIEW'
          }
        },
        LEGAL_COMPLIANCE_REVIEW: {
          stepOrder: 2,
          stepName: 'Legal Counsel Review',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_LEGAL_COUNSEL',
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            VERIFY_AND_ONBOARD: 'VENDOR_ACTIVE',
            REJECT: 'REJECTED'
          }
        },
        VENDOR_ACTIVE: {
          stepOrder: 3,
          stepName: 'Vendor Active',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 4,
          stepName: 'Onboarding Rejected',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    }
  },
  {
    id: 'blank',
    name: 'Blank Template',
    badge: 'Starter',
    description: 'Start from scratch with an initial step, an approved end, and a rejected end',
    template: {
      templateKey: 'CUSTOM_WORKFLOW_V1',
      version: 1,
      name: 'Custom Workflow Template',
      description: 'Custom workflow process',
      status: 'DRAFT',
      initialState: 'INITIATE',
      steps: {
        INITIATE: {
          stepOrder: 1,
          stepName: 'Initiate Request',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 24,
          transitions: {
            SUBMIT: 'COMPLETED',
            CANCEL: 'CANCELLED'
          }
        },
        COMPLETED: {
          stepOrder: 2,
          stepName: 'Approved & Completed',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        CANCELLED: {
          stepOrder: 3,
          stepName: 'Cancelled / Rejected',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    }
  }
];
