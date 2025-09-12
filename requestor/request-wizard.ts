// AFT Request Creation Wizard - Refactored Version
import { ComponentBuilder } from "../components/ui/server-components";
import { FormComponents } from "../components/ui/form-components";
import { RequestorNavigation, type RequestorUser } from "./requestor-nav";
import { getDb, generateRequestNumber, type AFTRequest } from "../lib/database-bun";

export interface AFTRequestDraft {
  // Section I
  media_control_number?: string;
  media_type?: string;
  
  // Section II  
  source_is?: string;
  source_classification?: string;
  destination_is?: string;
  destination_classification?: string;
  media_disposition?: string;
  overall_classification?: string;
  transfer_type?: string;
  destination_file?: 'upload' | 'download';
  process_name?: string;
  procedure_document?: string;
  justification?: string;
  num_files?: number;
  files?: Array<{ name: string; type: string; classification: string }>;
  additional_file_list_attached?: boolean;
  media_transportation?: boolean;
  media_destination?: string;
  destination_poc?: string;
  destination_address?: string;
  media_encrypted?: boolean;
  destinations_json?: string;
}

export class RequestWizard {
  
  static async render(user: RequestorUser, userId: number, draftId?: number): Promise<string> {
    const db = getDb();
    let existingDraft: any = null;
    
    // Load existing draft if editing
    if (draftId) {
      existingDraft = db.query("SELECT * FROM aft_requests WHERE id = ? AND requestor_id = ?").get(draftId, userId) as any;
      if (existingDraft) {
        // Parse files list if it exists
        if (existingDraft.files_list) {
          try {
            existingDraft.files = JSON.parse(existingDraft.files_list);
          } catch {
            existingDraft.files = [];
          }
        }
      }
    }

    // Load ALL DTAs immediately for the form
    const allDTAs = db.query(`
      SELECT DISTINCT u.id, u.email, u.first_name, u.last_name,
        CASE WHEN md.id IS NOT NULL THEN 1 ELSE 0 END as has_drive
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = 1
      LEFT JOIN media_drives md ON md.issued_to_user_id = u.id AND md.status = 'issued'
      WHERE u.is_active = 1 AND ur.role = 'dta'
      ORDER BY u.last_name, u.first_name
    `).all() as any[];

    // Status indicator
    const statusIndicator = existingDraft ? `
      <div class="mb-6 p-4 bg-[var(--muted)] rounded-lg border border-[var(--border)]">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-medium text-[var(--foreground)]">Request Status</h3>
            <p class="text-sm text-[var(--muted-foreground)]">
              ${existingDraft.status.toUpperCase()} - Last updated: ${new Date(existingDraft.updated_at * 1000).toLocaleString()}
            </p>
          </div>
          <div class="text-right">
            <div class="text-sm font-medium text-[var(--foreground)]">Request #</div>
            <div class="text-lg font-bold text-[var(--primary)]">${existingDraft.request_number}</div>
          </div>
        </div>
      </div>
    ` : '';

    // Prepare initial destinations JSON from existing draft transfer_data
    const initialDestinationsJson = (() => {
      try {
        const td = existingDraft?.transfer_data ? JSON.parse(existingDraft.transfer_data) : null;
        const arr = td?.destinations || [];
        return JSON.stringify(arr);
      } catch {
        return '[]';
      }
    })();

    // Generate DTA options with drive status indicator
    const dtaOptions = allDTAs.map(dta => ({
      value: dta.id.toString(),
      label: `${dta.first_name} ${dta.last_name} (${dta.email})${dta.has_drive ? '' : ' - ⚠️ No Drive Issued'}`
    }));

    // Section I - Media Information
    const sectionI = `
      ${FormComponents.sectionHeader({
        title: 'Media Information',
        subtitle: 'Basic media identification and type',
        sectionNumber: 'I'
      })}
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-[var(--muted)] border border-[var(--border)] rounded-md p-4 space-y-4">
          <h3 class="text-sm font-semibold text-[var(--foreground)]">Assignment</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${FormComponents.formField({
              label: 'Assigned Data Transfer Agent (DTA)',
              required: true,
              description: 'Select the DTA responsible for this transfer',
              children: FormComponents.select({
                name: 'dta_id',
                value: existingDraft?.dta_id?.toString() || '',
                placeholder: 'Select a DTA',
                required: true,
                options: dtaOptions
              })
            })}
            
            <div id="dta-warning" class="hidden col-span-2 p-3 bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-md">
              <p class="text-sm text-[var(--warning)]">⚠️ Selected DTA does not have a drive issued. Contact Media Custodian.</p>
            </div>
            
            ${FormComponents.formField({
              label: 'Media Control Number',
              description: 'Unique identifier for this media transfer',
              children: FormComponents.textInput({
                name: 'media_control_number',
                value: existingDraft?.request_number || '',
                maxLength: 50
              })
            })}
          </div>
        </div>
        
        <div class="bg-[var(--muted)] border border-[var(--border)] rounded-md p-4 space-y-4">
          <h3 class="text-sm font-semibold text-[var(--foreground)]">Media Details</h3>
          <div class="grid grid-cols-1 gap-6">
            ${FormComponents.formField({
              label: 'Media Type',
              required: true,
              description: 'Type of media being used for transfer',
              children: FormComponents.select({
                name: 'media_type',
                value: existingDraft?.media_type || '',
                required: true,
                options: [
                  { value: 'SSD', label: 'SSD (Solid State Drive)' },
                  { value: 'SSD-T', label: 'SSD (Travel)' },
                  { value: 'DVD', label: 'DVD' },
                  { value: 'DVD-R', label: 'DVD (Rewritable)' },
                  { value: 'DVD-RDL', label: 'DVD (Rewritable Dual Layer)' },
                  { value: 'CD', label: 'CD' },
                  { value: 'CD-R', label: 'CD (Rewritable)' },
                  { value: 'CD-RW', label: 'CD (Rewritable Dual Layer)' }
                ]
              })
            })}
          </div>
        </div>
      </div>
    `;

    // Section II - Transfer Details (unchanged)
    const sectionII = `
      ${FormComponents.sectionHeader({
        title: 'Transfer Details',
        subtitle: 'Source, destination, and transfer specifications',
        sectionNumber: 'II'
      })}
      
      <div class="space-y-8">
        <!-- Systems & Classification -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-[var(--muted)] border border-[var(--border)] rounded-md p-4 space-y-4">
            <h3 class="text-sm font-semibold text-[var(--foreground)]">Source System</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              ${FormComponents.formField({
                label: 'Source Information System (IS)',
                required: true,
                children: FormComponents.textInput({
                  name: 'source_is',
                  value: existingDraft?.source_system || '',
                  required: true,
                  maxLength: 100
                })
              })}
              ${FormComponents.formField({
                label: 'Source Classification',
                required: true,
                children: FormComponents.select({
                  name: 'source_classification',
                  value: existingDraft?.source_classification || '',
                  required: true,
                  options: [
                    { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED' },
                    { value: 'CUI', label: 'CUI (Controlled Unclassified Information)' },
                    { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL' },
                    { value: 'SECRET', label: 'SECRET' },
                    { value: 'TOP SECRET', label: 'TOP SECRET' },
                    { value: 'TOP SECRET//SCI', label: 'TOP SECRET//SCI' }
                  ]
                })
              })}
            </div>
          </div>
          <div class="bg-[var(--muted)] border border-[var(--border)] rounded-md p-4 space-y-4">
            <h3 class="text-sm font-semibold text-[var(--foreground)]">Primary Destination</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              ${FormComponents.formField({
                label: 'Destination Information System (IS)',
                required: true,
                children: FormComponents.textInput({
                  name: 'destination_is',
                  value: existingDraft?.dest_system || '',
                  required: true,
                  maxLength: 100
                })
              })}
              ${FormComponents.formField({
                label: 'Destination Classification',
                required: true,
                children: FormComponents.select({
                  name: 'destination_classification',
                  value: existingDraft?.destination_classification || '',
                  required: true,
                  options: [
                    { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED' },
                    { value: 'CUI', label: 'CUI (Controlled Unclassified Information)' },
                    { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL' },
                    { value: 'SECRET', label: 'SECRET' },
                    { value: 'TOP SECRET', label: 'TOP SECRET' },
                    { value: 'TOP SECRET//SCI', label: 'TOP SECRET//SCI' }
                  ]
                })
              })}
            </div>
          </div>
        </div>

        <!-- Additional Destinations -->
        <div class="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-medium text-[var(--foreground)]">Additional Destinations</h4>
            <button type="button" class="action-btn secondary" onclick="RequestWizard.addDestination()">+ Add Destination</button>
          </div>
          <div id="destinations-list" class="space-y-2"></div>
          <p class="text-xs text-[var(--muted-foreground)]">Add any additional destination systems and their classification.</p>
        </div>

        <!-- Classification & Disposition -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${FormComponents.formField({
            label: 'Media Disposition',
            required: true,
            description: 'How will the media be handled after transfer',
            children: FormComponents.select({
              name: 'media_disposition',
              value: existingDraft?.media_disposition || '',
              required: true,
              options: [
                { value: 'Destroy', label: 'Destroy (Physical destruction)' },
                { value: 'Sanitize', label: 'Sanitize (Data wiping)' },
                { value: 'Retain', label: 'Retain (Keep for future use)' },
                { value: 'Return to Owner', label: 'Return to Owner' },
                { value: 'Degauss', label: 'Degauss (Magnetic erasure)' },
                { value: 'Overwrite', label: 'Overwrite (Multiple pass)' }
              ]
            })
          })}
          ${FormComponents.formField({
            label: 'Overall Classification',
            required: true,
            description: 'Highest classification level of all data',
            children: FormComponents.select({
              name: 'overall_classification',
              value: existingDraft?.classification || '',
              required: true,
              options: [
                { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED' },
                { value: 'CUI', label: 'CUI (Controlled Unclassified Information)' },
                { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL' },
                { value: 'SECRET', label: 'SECRET' },
                { value: 'TOP SECRET', label: 'TOP SECRET' },
                { value: 'TOP SECRET//SCI', label: 'TOP SECRET//SCI' }
              ]
            })
          })}
        </div>

        <!-- Transfer Spec -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${FormComponents.formField({
            label: 'Transfer Type',
            required: true,
            children: FormComponents.select({
              name: 'transfer_type',
              value: existingDraft?.transfer_type || '',
              required: true,
              options: [
                { value: 'High-to-Low', label: 'High-to-Low' },
                { value: 'Low-to-High', label: 'Low-to-High' },
                { value: 'Low-to-Low', label: 'Low-to-Low' },
                { value: 'Intra-Domain', label: 'Intra-Domain' },
              ]
            })
          })}
          ${FormComponents.formField({
            label: 'Destination File Operation',
            required: true,
            description: 'Are you adding files to or removing files from the destination IS?',
            children: FormComponents.radioGroup({
              name: 'destination_file',
              value: existingDraft?.destination_file || '',
              inline: true,
              options: [
                { value: 'upload', label: 'Upload (Add Files to IS)' },
                { value: 'download', label: 'Download (Remove Files from IS)' }
              ]
            })
          })}
        </div>

        <!-- Process Details -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${FormComponents.formField({
            label: 'Process Name (If Non-Human Readable)',
            description: 'Required if transferring machine-readable files',
            children: FormComponents.textInput({
              name: 'process_name',
              value: existingDraft?.process_name || '',
              maxLength: 200
            })
          })}
          ${FormComponents.formField({
            label: 'Procedure Document #',
            description: 'Reference document number (as applicable)',
            children: FormComponents.textInput({
              name: 'procedure_document',
              value: existingDraft?.procedure_document || '',
              maxLength: 100
            })
          })}
        </div>

        <!-- Justification -->
        ${FormComponents.formField({
          label: 'Justification for Transfer',
          required: true,
          description: 'Explain the business need and purpose for this transfer',
          children: FormComponents.textarea({
            name: 'justification',
            value: existingDraft?.transfer_purpose || '',
            rows: 4,
            required: true
          })
        })}

        <!-- Files -->
        <div class="bg-[var(--muted)] border border-[var(--border)] rounded-md p-4 space-y-4">
          <h3 class="text-sm font-semibold text-[var(--foreground)]">Files</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              ${FormComponents.formField({
                label: 'Number of Files for Transfer',
                required: true,
                children: FormComponents.textInput({
                  name: 'num_files',
                  value: existingDraft?.num_files?.toString() || '',
                  required: true
                })
              })}
            </div>
            <div class="md:col-span-2">
              ${FormComponents.formField({
                label: 'File Names, Types, and Classification',
                required: true,
                description: 'List each file with its type and classification level',
                children: FormComponents.fileListInput({
                  files: existingDraft?.files || [],
                  maxFiles: 5
                })
              })}
            </div>
          </div>
        </div>

        <!-- Transport & Encryption -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-[var(--muted)] p-4 rounded-md space-y-4 border border-[var(--border)]">
            <h4 class="font-medium text-[var(--foreground)]">Media Transportation</h4>
            ${FormComponents.formField({
              label: 'Will media be transported outside an approved area?',
              required: true,
              children: FormComponents.radioGroup({
                name: 'media_transportation',
                value: existingDraft?.media_transportation?.toString() || '',
                inline: true,
                options: [
                  { value: 'true', label: 'Yes' },
                  { value: 'false', label: 'No' }
                ]
              })
            })}
            <div id="transport-details" style="display: ${existingDraft?.media_transportation ? 'block' : 'none'}">
              <div class="grid grid-cols-1 gap-4">
                ${FormComponents.formField({
                  label: 'Media Destination',
                  children: FormComponents.textInput({
                    name: 'media_destination',
                    value: existingDraft?.media_destination || '',
                    maxLength: 200
                  })
                })}
                ${FormComponents.formField({
                  label: 'Destination POC / Customer Name',
                  children: FormComponents.textInput({
                    name: 'destination_poc',
                    value: existingDraft?.dest_contact || '',
                    maxLength: 100
                  })
                })}
                ${FormComponents.formField({
                  label: 'Destination Address / Location',
                  children: FormComponents.textarea({
                    name: 'destination_address',
                    value: existingDraft?.dest_location || '',
                    rows: 3
                  })
                })}
              </div>
            </div>
          </div>
          <div class="bg-[var(--muted)] p-4 rounded-md border border-[var(--border)]">
            <h4 class="font-medium text-[var(--foreground)] mb-2">Media Encryption</h4>
            <p class="text-xs text-[var(--muted-foreground)] mb-4">
              Cryptographic mechanisms during transport outside of controlled areas shall be either an NSA or FIPS 140-2 compliant algorithm. [MP-5(4)]
            </p>
            ${FormComponents.formField({
              label: 'Will Media be Encrypted?',
              required: true,
              children: FormComponents.radioGroup({
                name: 'media_encrypted',
                value: existingDraft?.media_encrypted?.toString() || '',
                inline: true,
                options: [
                  { value: 'true', label: 'Yes' },
                  { value: 'false', label: 'No' }
                ]
              })
            })}
          </div>
        </div>
      </div>
    `;

    // Signature Section - Only show when reviewing saved draft
    const signatureSection = existingDraft && existingDraft.status === 'draft' ? `
      ${FormComponents.sectionHeader({
        title: 'Review & Digital Signature',
        subtitle: 'Review your request and provide digital signature to submit',
        sectionNumber: 'III'
      })}
      
      <div class="space-y-6">
        <!-- Request Summary -->
        <div class="bg-[var(--muted)] border border-[var(--border)] rounded-md p-4">
          <h3 class="text-sm font-semibold text-[var(--foreground)] mb-3">Request Summary</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div><span class="text-[var(--muted-foreground)]">Request #:</span> <span class="font-medium">${existingDraft.request_number}</span></div>
            <div><span class="text-[var(--muted-foreground)]">Classification:</span> <span class="font-medium">${existingDraft.classification || 'Not specified'}</span></div>
            <div><span class="text-[var(--muted-foreground)]">Source:</span> <span class="font-medium">${existingDraft.source_system || 'Not specified'}</span></div>
            <div><span class="text-[var(--muted-foreground)]">Destination:</span> <span class="font-medium">${existingDraft.dest_system || 'Not specified'}</span></div>
          </div>
        </div>
        
        <!-- Certification & Signature -->
        <div class="bg-[var(--muted)] border border-[var(--border)] rounded-md p-4 space-y-4">
          <h3 class="text-sm font-semibold text-[var(--foreground)]">Certification & Signature</h3>
          
          <div class="text-sm text-[var(--muted-foreground)] mb-4 p-3 bg-[var(--card)] rounded border-l-4 border-[var(--primary)]">
            <strong>Certification Statement:</strong><br/>
            "I certify that the above file(s)/media to be transferred to/from the IS are required to support the development and sustainment contractual efforts and comply with all applicable security requirements."
          </div>
          
          ${FormComponents.formField({
            label: 'Choose Signature Method',
            required: true,
            children: FormComponents.radioGroup({
              name: 'signature_method',
              value: 'manual',
              options: [
                { value: 'manual', label: 'Type Name (Manual Signature)' },
                { value: 'cac', label: 'CAC Certificate (Automatic via HTTPS)' }
              ]
            })
          })}
          
          <div id="manual-signature-area" class="mt-4">
            ${FormComponents.formField({
              label: 'Type your full name to confirm certification',
              required: true,
              description: 'By typing your name, you certify the accuracy of this request',
              children: FormComponents.textInput({
                name: 'manual_signature',
                value: '',
                placeholder: 'Enter your full legal name'
              })
            })}
          </div>
          
          <div id="cac-signature-area" class="mt-4 hidden">
            <div class="flex items-center gap-3 p-3 bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-lg">
              <div class="w-2 h-2 rounded-full bg-[var(--info)]"></div>
              <span class="text-sm text-[var(--info)]">CAC authentication will be performed via HTTPS client certificate</span>
            </div>
          </div>
        </div>
      </div>
    ` : '';

    // Form actions based on draft status
    const formActions = `
      <div class="flex justify-between items-center pt-6 border-t border-[var(--border)]">
        <button
          type="button"
          onclick="window.location.href='/requestor/requests'"
          class="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] bg-[var(--background)] border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
        >
          Back to Requests
        </button>
        
        <div class="flex space-x-3">
          ${existingDraft && existingDraft.status !== 'draft' ? `
            <div class="px-4 py-2 text-sm text-[var(--muted-foreground)]">
              Request already submitted
            </div>
          ` : `
            <button
              type="button"
              onclick="RequestWizard.saveDraft()"
              id="save-button"
              class="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--secondary)] hover:bg-[var(--secondary)]/80 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span id="save-button-text">${existingDraft ? 'Update Draft' : 'Save Draft'}</span>
              <span id="save-button-spinner" class="hidden">Saving...</span>
            </button>
            
            ${existingDraft && existingDraft.status === 'draft' ? `
              <button
                type="button"
                onclick="RequestWizard.submitRequest()"
                id="submit-button"
                class="px-6 py-2 text-sm font-medium text-[var(--primary-foreground)] bg-[var(--primary)] hover:bg-[var(--primary)]/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span id="submit-button-text">Sign & Submit Request</span>
                <span id="submit-button-spinner" class="hidden">Submitting...</span>
              </button>
            ` : ''}
          `}
        </div>
      </div>
    `;

    const content = `
        ${statusIndicator}

        <form id="aft-request-form" class="space-y-8">
          <input type="hidden" name="draft_id" value="${draftId || ''}" />
          <input type="hidden" name="requestor_id" value="${userId}" />
          <input type="hidden" id="initial-destinations" value='${initialDestinationsJson.replace(/'/g, "&#39;").replace(/</g, "&lt;")}' />
          <input type="hidden" name="destinations_json" id="destinations_json" value='' />
          <input type="hidden" id="dta-data" value='${JSON.stringify(allDTAs).replace(/'/g, "&#39;").replace(/</g, "&lt;")}' />

          <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 space-y-8" id="form-container">
            ${sectionI}
            ${sectionII}
            ${signatureSection}
            ${formActions}
          </div>
        </form>
        
        <script>${RequestWizard.getScript()}</script>
    `;

    return RequestorNavigation.renderLayout(
      draftId ? `Request ${existingDraft?.request_number || 'Edit'}` : 'New Request',
      existingDraft ? 'View and modify your AFT request' : 'Create your Assured File Transfer request',
      user,
      '/requestor/new-request',
      content
    );
  }

  static getScript(): string {
    return `
      // Refactored Request Wizard Script
      window.RequestWizard = {
        destinations: [],
        dtaData: [],
        
        init() {
          // Parse DTA data from hidden field
          const dtaDataEl = document.getElementById('dta-data');
          if (dtaDataEl) {
            try {
              this.dtaData = JSON.parse(dtaDataEl.value);
            } catch (e) {
              console.error('Failed to parse DTA data');
            }
          }
          
          // Initialize destinations from existing data
          try {
            const initEl = document.getElementById('initial-destinations');
            if (initEl && initEl.value) {
              const parsed = JSON.parse(initEl.value);
              if (Array.isArray(parsed)) {
                // Skip the first (primary) destination
                this.destinations = parsed.slice(1).map(d => ({
                  is: d?.is || '',
                  classification: d?.classification || ''
                }));
              }
            }
          } catch (e) {
            console.warn('Failed to parse initial destinations');
          }
          
          this.renderDestinations();
          this.setupEventListeners();
          this.generateControlNumber();
          this.validateDTA();
        },
        
        setupEventListeners() {
          // DTA selection change
          const dtaSelect = document.querySelector('select[name="dta_id"]');
          if (dtaSelect) {
            dtaSelect.addEventListener('change', () => this.validateDTA());
          }
          
          // Media transportation toggle
          const transportRadios = document.querySelectorAll('input[name="media_transportation"]');
          transportRadios.forEach(radio => {
            radio.addEventListener('change', function() {
              const details = document.getElementById('transport-details');
              if (details) {
                details.style.display = this.value === 'true' ? 'block' : 'none';
              }
            });
          });
          
          // Signature method toggle
          const signatureRadios = document.querySelectorAll('input[name="signature_method"]');
          signatureRadios.forEach(radio => {
            radio.addEventListener('change', function() {
              const manualArea = document.getElementById('manual-signature-area');
              const cacArea = document.getElementById('cac-signature-area');
              
              if (this.value === 'manual') {
                if (manualArea) manualArea.classList.remove('hidden');
                if (cacArea) cacArea.classList.add('hidden');
              } else if (this.value === 'cac') {
                if (manualArea) manualArea.classList.add('hidden');
                if (cacArea) cacArea.classList.remove('hidden');
              }
            });
          });
        },
        
        generateControlNumber() {
          const controlField = document.querySelector('input[name="media_control_number"]');
          if (controlField && !controlField.value) {
            const timestamp = Date.now().toString(36).toUpperCase();
            const random = Math.random().toString(36).substring(2, 6).toUpperCase();
            controlField.value = 'AFT-' + timestamp + '-' + random;
          }
        },
        
        async validateDTA() {
          const dtaSelect = document.querySelector('select[name="dta_id"]');
          const warningDiv = document.getElementById('dta-warning');
          
          if (!dtaSelect || !dtaSelect.value) {
            if (warningDiv) warningDiv.classList.add('hidden');
            return;
          }
          
          const selectedDTA = this.dtaData.find(d => d.id.toString() === dtaSelect.value);
          
          if (selectedDTA && !selectedDTA.has_drive) {
            // Show warning but don't disable form
            if (warningDiv) warningDiv.classList.remove('hidden');
          } else {
            if (warningDiv) warningDiv.classList.add('hidden');
            
            // Try to fetch drive details
            try {
              const res = await fetch('/api/requestor/dta/' + dtaSelect.value + '/issued-drive');
              const data = await res.json();
              
              if (data.hasDrive && data.drive) {
                const controlField = document.querySelector('input[name="media_control_number"]');
                const mediaTypeSelect = document.querySelector('select[name="media_type"]');
                
                if (controlField && data.drive.media_control_number) {
                  controlField.value = data.drive.media_control_number;
                }
                if (mediaTypeSelect && data.drive.type) {
                  mediaTypeSelect.value = data.drive.type;
                }
              }
            } catch (e) {
              console.error('Failed to fetch drive details', e);
            }
          }
        },
        
        renderDestinations() {
          const container = document.getElementById('destinations-list');
          if (!container) return;
          
          container.innerHTML = this.destinations.map((dest, idx) => {
            const isVal = dest?.is || '';
            const clsVal = dest?.classification || '';
            const options = ['', 'UNCLASSIFIED', 'CUI', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET', 'TOP SECRET//SCI']
              .map(v => {
                const selected = v === clsVal ? ' selected' : '';
                return '<option value="' + v + '"' + selected + '>' + (v || 'Select Classification') + '</option>';
              }).join('');
              
            return (
              '<div class="grid grid-cols-1 md:grid-cols-3 gap-2" data-dest-index="' + idx + '">' +
                '<input type="text" placeholder="Destination IS" class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] focus:border-[var(--primary)]" value="' + isVal + '" oninput="RequestWizard.updateDestination(' + idx + ', \\'is\\', this.value)" />' +
                '<select class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] focus:border-[var(--primary)]" onchange="RequestWizard.updateDestination(' + idx + ', \\'classification\\', this.value)">' + options + '</select>' +
                '<button type="button" class="px-2 py-1 text-xs text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded" onclick="RequestWizard.removeDestination(' + idx + ')">Remove</button>' +
              '</div>'
            );
          }).join('');
        },
        
        addDestination() {
          this.destinations.push({ is: '', classification: '' });
          this.renderDestinations();
        },
        
        removeDestination(index) {
          this.destinations.splice(index, 1);
          this.renderDestinations();
        },
        
        updateDestination(index, key, value) {
          if (!this.destinations[index]) {
            this.destinations[index] = { is: '', classification: '' };
          }
          this.destinations[index][key] = value;
        },
        
        async saveDraft() {
          // Show loading state
          const saveBtn = document.getElementById('save-button');
          const saveBtnText = document.getElementById('save-button-text');
          const saveBtnSpinner = document.getElementById('save-button-spinner');
          
          if (saveBtn) {
            saveBtn.setAttribute('disabled', 'disabled');
            if (saveBtnText) saveBtnText.classList.add('hidden');
            if (saveBtnSpinner) saveBtnSpinner.classList.remove('hidden');
          }
          
          const form = document.getElementById('aft-request-form');
          const formData = new FormData(form);
          const data = Object.fromEntries(formData.entries());
          
          // Validate required fields
          const dtaSelect = document.querySelector('select[name="dta_id"]');
          if (!dtaSelect || !dtaSelect.value) {
            alert('Please select a DTA for this request.');
            this.resetSaveButton();
            return;
          }
          
          // Collect files
          const files = [];
          const fileRows = document.querySelectorAll('[data-file-index]');
          fileRows.forEach(row => {
            const idx = row.getAttribute('data-file-index');
            const name = row.querySelector('[name="files[' + idx + '][name]"]')?.value;
            const type = row.querySelector('[name="files[' + idx + '][type]"]')?.value;
            const size = row.querySelector('[name="files[' + idx + '][size]"]')?.value;
            const classification = row.querySelector('[name="files[' + idx + '][classification]"]')?.value;
            
            if (name && classification) {
              files.push({ name, type: type || '', size: size || '', classification });
            }
          });
          
          data.files = JSON.stringify(files);
          
          // Compose destinations
          const primaryIs = document.querySelector('input[name="destination_is"]')?.value || '';
          const primaryCls = document.querySelector('select[name="destination_classification"]')?.value || '';
          const allDestinations = [
            { is: primaryIs, classification: primaryCls },
            ...this.destinations
          ];
          
          data.destinations_json = JSON.stringify(allDestinations);
          data.status = 'draft';
          
          try {
            const response = await fetch('/api/requestor/save-draft', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            
            if (response.ok) {
              const result = await response.json();
              const draftId = result.requestId || data.draft_id;
              if (draftId) {
                // Show success message before redirect
                const successMsg = document.createElement('div');
                successMsg.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
                successMsg.textContent = 'Draft saved successfully! Redirecting...';
                document.body.appendChild(successMsg);
                
                // Redirect to request details page after short delay
                setTimeout(() => {
                  window.location.href = '/requestor/requests/' + draftId;
                }, 1000);
              }
            } else {
              alert('Failed to save draft. Please check all required fields and try again.');
              this.resetSaveButton();
            }
          } catch (e) {
            console.error('Save draft error:', e);
            alert('Failed to save draft. Please try again.');
            this.resetSaveButton();
          }
        },
        
        resetSaveButton() {
          const saveBtn = document.getElementById('save-button');
          const saveBtnText = document.getElementById('save-button-text');
          const saveBtnSpinner = document.getElementById('save-button-spinner');
          
          if (saveBtn) {
            saveBtn.removeAttribute('disabled');
            if (saveBtnText) saveBtnText.classList.remove('hidden');
            if (saveBtnSpinner) saveBtnSpinner.classList.add('hidden');
          }
        },
        
        async submitRequest() {
          // Show loading state
          const submitBtn = document.getElementById('submit-button');
          const submitBtnText = document.getElementById('submit-button-text');
          const submitBtnSpinner = document.getElementById('submit-button-spinner');
          
          if (submitBtn) {
            submitBtn.setAttribute('disabled', 'disabled');
            if (submitBtnText) submitBtnText.classList.add('hidden');
            if (submitBtnSpinner) submitBtnSpinner.classList.remove('hidden');
          }
          
          const form = document.getElementById('aft-request-form');
          const formData = new FormData(form);
          const signatureMethod = formData.get('signature_method');
          const requestId = formData.get('draft_id');
          
          if (!requestId) {
            alert('Error: Request ID not found. Please refresh the page and try again.');
            this.resetSubmitButton();
            return;
          }
          
          // Validate DTA has drive
          const dtaSelect = document.querySelector('select[name="dta_id"]');
          if (!dtaSelect || !dtaSelect.value) {
            alert('Please select a DTA for this request.');
            this.resetSubmitButton();
            return;
          }
          
          const selectedDTA = this.dtaData.find(d => d.id.toString() === dtaSelect.value);
          if (selectedDTA && !selectedDTA.has_drive) {
            alert('The selected DTA does not have a drive issued. Please contact the Media Custodian or select a different DTA.');
            this.resetSubmitButton();
            return;
          }
          
          try {
            if (signatureMethod === 'manual') {
              const manualSignature = formData.get('manual_signature');
              if (!manualSignature || manualSignature.trim() === '') {
                alert('Please enter your full name to sign the request.');
                this.resetSubmitButton();
                return;
              }
              
              await this.submitWithSignature(requestId, 'manual', manualSignature.trim());
              
            } else if (signatureMethod === 'cac') {
              await this.submitWithSignature(requestId, 'cac', null);
              
            } else {
              alert('Please select a signature method.');
              this.resetSubmitButton();
            }
          } catch (error) {
            console.error('Submit error:', error);
            alert('Failed to submit request. Please try again.');
            this.resetSubmitButton();
          }
        },
        
        resetSubmitButton() {
          const submitBtn = document.getElementById('submit-button');
          const submitBtnText = document.getElementById('submit-button-text');
          const submitBtnSpinner = document.getElementById('submit-button-spinner');
          
          if (submitBtn) {
            submitBtn.removeAttribute('disabled');
            if (submitBtnText) submitBtnText.classList.remove('hidden');
            if (submitBtnSpinner) submitBtnSpinner.classList.add('hidden');
          }
        },
        
        async submitWithSignature(requestId, method, signature) {
          try {
            const response = await fetch('/api/requestor/submit-request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestId,
                signatureMethod: method,
                manualSignature: signature
              })
            });
            
            const result = await response.json();
            
            if (result.success) {
              // Show success message
              const successMsg = document.createElement('div');
              successMsg.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
              successMsg.textContent = 'Request submitted successfully! Redirecting...';
              document.body.appendChild(successMsg);
              
              // Redirect after short delay
              setTimeout(() => {
                window.location.href = '/requestor/requests';
              }, 1500);
            } else {
              alert('Error: ' + (result.message || 'Failed to submit request'));
              this.resetSubmitButton();
            }
          } catch (error) {
            console.error('Submit signature error:', error);
            alert('Failed to submit request. Please try again.');
            this.resetSubmitButton();
          }
        }
      };
      
      // Initialize on DOM ready
      document.addEventListener('DOMContentLoaded', () => RequestWizard.init());
    `;
  }
}