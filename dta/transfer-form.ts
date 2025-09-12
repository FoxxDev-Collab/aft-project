// DTA Transfer Form - Step-by-step transfer workflow with proper form interface
import { ComponentBuilder } from "../components/ui/server-components";
import { DTANavigation, type DTAUser } from "./dta-nav";
import { getDb } from "../lib/database-bun";

export class DTATransferForm {
  static async render(user: DTAUser, requestId: string, userId: number): Promise<string> {
    const db = getDb();
    
    // Get request details
    const request = db.query(`
      SELECT 
        id, request_number, requestor_name, requestor_email,
        source_system, source_location, dest_system, dest_location,
        classification, data_size, files_list, justification,
        origination_scan_status, origination_files_scanned,
        destination_scan_status, destination_files_scanned,
        transfer_completed_date, dta_signature_date,
        assigned_sme_id, status, created_at, updated_at
      FROM aft_requests
      WHERE id = ? AND dta_id = ?
    `).get(requestId, userId) as any;

    if (!request) {
      return this.renderNotFound(user);
    }

    // Get available SME users
    const smeUsers = db.query(`
      SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      WHERE ur.role = 'sme' AND u.is_active = 1
      ORDER BY u.last_name, u.first_name
    `).all() as any[];

    const content = this.buildTransferForm(request, smeUsers);

    return DTANavigation.renderLayout(
      'Transfer Management',
      `Section 4 Procedures - Request ${request.request_number}`,
      user,
      '/dta/active',
      content
    );
  }

  private static buildTransferForm(request: any, smeUsers: any[]): string {
    const currentStep = this.getCurrentStep(request);
    const submitText = this.getSubmitButtonText(currentStep, request);
    const submitButton = submitText ? `
                <button type="submit" 
                        class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
                  ${submitText}
                </button>
              ` : '';
    
    return `
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- Request Header -->
        <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
          <div class="flex items-start justify-between">
            <div>
              <h1 class="text-2xl font-bold text-[var(--foreground)]">Transfer Management</h1>
              <p class="text-[var(--muted-foreground)]">Request ${request.request_number} - Section 4 Procedures</p>
            </div>
            <div class="text-right">
              <div class="text-sm font-medium text-[var(--foreground)]">${request.requestor_name}</div>
              <div class="text-xs text-[var(--muted-foreground)]">${request.classification}</div>
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[var(--border)]">
            <div>
              <label class="text-sm font-medium text-[var(--muted-foreground)]">Transfer Route</label>
              <div class="text-[var(--foreground)]">${request.source_system || 'Source'} → ${request.dest_system || request.dest_location || 'Destination'}</div>
            </div>
            <div>
              <label class="text-sm font-medium text-[var(--muted-foreground)]">File Details</label>
              <div class="text-[var(--foreground)]">Size: ${request.data_size || 'Unknown size'}</div>
            </div>
          </div>
        </div>

        <!-- Progress Steps -->
        ${this.buildProgressSteps(currentStep)}

        <!-- Transfer Form -->
        <form id="transferForm" class="space-y-6">
          <input type="hidden" name="requestId" value="${request.id}">
          
          ${this.buildAVScanSection(request, currentStep)}
          ${this.buildTransferSection(request, currentStep)}
          ${this.buildSignatureSection(request, smeUsers, currentStep)}
          
          <!-- Form Actions -->
          <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
            <div class="flex items-center justify-between">
              <button type="button" onclick="window.location.href='/dta/active'" 
                      class="px-4 py-2 border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--muted)]">
                Back to Active Transfers
              </button>
              <div class="flex gap-2">
                <button type="button" onclick="saveProgress()" 
                        class="px-4 py-2 border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--muted)]">
                  Save Progress
                </button>
                ${submitButton}
              </div>
            </div>
          </div>
        </form>
      </div>
    `;
  }

  private static getCurrentStep(request: any): number {
    if (!request.origination_scan_status || !request.destination_scan_status) return 1;
    if (!request.transfer_completed_date) return 2;
    if (!request.dta_signature_date) return 3;
    return 4; // Complete
  }

  private static isStepAccessible(stepNumber: number, request: any): boolean {
    const currentStep = this.getCurrentStep(request);
    // Unlock signature step as soon as both AV scans are recorded (no need to click Complete Transfer)
    const scansRecorded = !!request.origination_scan_status && !!request.destination_scan_status;
    if (stepNumber === 3 && scansRecorded) return true;
    return stepNumber <= currentStep;
  }

  private static buildProgressSteps(currentStep: number): string {
    const steps = [
      { id: 1, title: 'AV Scan Verification', description: 'Record origination and destination scan results' },
      { id: 2, title: 'File Transfer', description: 'Perform the actual file transfer' },
      { id: 3, title: 'DTA Signature', description: 'Sign transfer and assign SME' },
      { id: 4, title: 'Complete', description: 'Transfer ready for SME verification' }
    ];

    const stepsHtml = steps.map(step => {
      const isActive = step.id === currentStep;
      const isComplete = step.id < currentStep;
      const statusClass = isComplete ? 'bg-[var(--success)] text-white' : 
                         isActive ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 
                         'bg-[var(--muted)] text-[var(--muted-foreground)]';
      
      return `
        <div class="flex items-center ${step.id < steps.length ? 'flex-1' : ''}">
          <div class="flex items-center">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${statusClass}">
              ${isComplete ? '✓' : step.id}
            </div>
            <div class="ml-3">
              <div class="text-sm font-medium text-[var(--foreground)]">${step.title}</div>
              <div class="text-xs text-[var(--muted-foreground)]">${step.description}</div>
            </div>
          </div>
          ${step.id < steps.length ? '<div class="flex-1 h-px bg-[var(--border)] mx-4"></div>' : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
        <div class="flex items-center">
          ${stepsHtml}
        </div>
      </div>
    `;
  }

  private static buildAVScanSection(request: any, currentStep: number): string {
    const isActive = currentStep === 1;
    const isComplete = currentStep > 1;
    
    return `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 ${!isActive && !isComplete ? 'opacity-50' : ''}">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
            isComplete ? 'bg-[var(--success)] text-white' : 
            isActive ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 
            'bg-[var(--muted)] text-[var(--muted-foreground)]'
          }">
            ${isComplete ? '✓' : '1'}
          </div>
          <h3 class="text-lg font-semibold text-[var(--foreground)]">Anti-Virus Scan Verification</h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Origination Scan -->
          <div class="space-y-3">
            <label class="text-sm font-medium text-[var(--foreground)]">Origination Media Scan</label>
            <div class="space-y-2">
              <select name="originationScanResult" class="w-full p-2 border border-[var(--border)] rounded-md" ${!isActive ? 'disabled' : ''}>
                <option value="">Select scan result...</option>
                <option value="clean" ${request.origination_scan_status === 'clean' ? 'selected' : ''}>Clean</option>
                <option value="infected" ${request.origination_scan_status === 'infected' ? 'selected' : ''}>Infected</option>
              </select>
              <input type="number" name="originationFilesScanned" placeholder="Number of files scanned" 
                     class="w-full p-2 border border-[var(--border)] rounded-md" 
                     value="${request.origination_files_scanned || ''}" ${!isActive ? 'disabled' : ''} min="0">
            </div>
            ${request.origination_scan_status ? `
              <div class="text-xs p-2 rounded ${request.origination_scan_status === 'clean' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--destructive)]/10 text-[var(--destructive)]'}">
                Status: ${request.origination_scan_status.toUpperCase()} ${request.origination_files_scanned ? `(${request.origination_files_scanned} files)` : ''}
              </div>
            ` : ''}
          </div>

          <!-- Destination Scan -->
          <div class="space-y-3">
            <label class="text-sm font-medium text-[var(--foreground)]">Destination Media Scan</label>
            <div class="space-y-2">
              <select name="destinationScanResult" class="w-full p-2 border border-[var(--border)] rounded-md" ${!isActive ? 'disabled' : ''}>
                <option value="">Select scan result...</option>
                <option value="clean" ${request.destination_scan_status === 'clean' ? 'selected' : ''}>Clean</option>
                <option value="infected" ${request.destination_scan_status === 'infected' ? 'selected' : ''}>Infected</option>
              </select>
              <input type="number" name="destinationFilesScanned" placeholder="Number of files scanned" 
                     class="w-full p-2 border border-[var(--border)] rounded-md" 
                     value="${request.destination_files_scanned || ''}" ${!isActive ? 'disabled' : ''} min="0">
            </div>
            ${request.destination_scan_status ? `
              <div class="text-xs p-2 rounded ${request.destination_scan_status === 'clean' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--destructive)]/10 text-[var(--destructive)]'}">
                Status: ${request.destination_scan_status.toUpperCase()} ${request.destination_files_scanned ? `(${request.destination_files_scanned} files)` : ''}
              </div>
            ` : ''}
          </div>
        </div>

        <div class="mt-4">
          <label class="text-sm font-medium text-[var(--foreground)]">Scan Notes</label>
          <textarea name="scanNotes" rows="2" class="w-full p-2 border border-[var(--border)] rounded-md mt-1" 
                    placeholder="Additional notes about the AV scan results..." ${!isActive ? 'disabled' : ''}></textarea>
        </div>
      </div>
    `;
  }

  private static buildTransferSection(request: any, currentStep: number): string {
    const isActive = currentStep === 2;
    const isComplete = currentStep > 2;
    const canTransfer = !!request.origination_scan_status && !!request.destination_scan_status;
    
    return `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 ${!isActive && !isComplete ? 'opacity-50' : ''}">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
            isComplete ? 'bg-[var(--success)] text-white' : 
            isActive ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 
            'bg-[var(--muted)] text-[var(--muted-foreground)]'
          }">
            ${isComplete ? '✓' : '2'}
          </div>
          <h3 class="text-lg font-semibold text-[var(--foreground)]">File Transfer Execution</h3>
        </div>

        ${!canTransfer && !isComplete ? `
          <div class="bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg p-4 mb-4">
            <div class="text-sm text-[var(--warning)]">
              ⚠️ Transfer cannot proceed until both origination and destination AV scans are recorded.
            </div>
          </div>
        ` : ''}

        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">Files Transferred</label>
              <input type="number" name="filesTransferred" placeholder="Number of files transferred" 
                     class="w-full p-2 border border-[var(--border)] rounded-md mt-1" 
                     ${!isActive ? 'disabled' : ''} min="0" required>
            </div>
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">Transfer Date/Time</label>
              <input type="datetime-local" name="transferDateTime" 
                     class="w-full p-2 border border-[var(--border)] rounded-md mt-1" 
                     ${!isActive ? 'disabled' : ''} value="${request.transfer_completed_date ? new Date(request.transfer_completed_date * 1000).toISOString().slice(0, 16) : ''}">
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">Transfer Notes</label>
            <textarea name="transferNotes" rows="3" class="w-full p-2 border border-[var(--border)] rounded-md mt-1" 
                      placeholder="Details about the transfer process, any issues encountered, etc." ${!isActive ? 'disabled' : ''}></textarea>
          </div>

          ${isComplete ? `
            <div class="text-xs p-2 rounded bg-[var(--success)]/10 text-[var(--success)]">
              ✓ Transfer completed on ${new Date(request.transfer_completed_date * 1000).toLocaleString()}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private static buildSignatureSection(request: any, smeUsers: any[], currentStep: number): string {
    const isActive = currentStep === 3;
    const isComplete = currentStep > 3;
    const isAccessible = this.isStepAccessible(3, request);
    const scansRecorded = !!request.origination_scan_status && !!request.destination_scan_status;
    
    return `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 ${!isAccessible ? 'opacity-50' : ''}">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
            isComplete ? 'bg-[var(--success)] text-white' : 
            isAccessible ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 
            'bg-[var(--muted)] text-[var(--muted-foreground)]'
          }">
            ${isComplete ? '✓' : '3'}
          </div>
          <h3 class="text-lg font-semibold text-[var(--foreground)]">DTA Signature & SME Assignment</h3>
          ${scansRecorded && !isComplete ? `
            <div class="ml-auto">
              <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[var(--info)]/10 text-[var(--info)]">
                Ready for Signature
              </span>
            </div>
          ` : ''}
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">Assign SME for Two-Person Integrity</label>
              <select name="smeUserId" class="w-full p-2 border border-[var(--border)] rounded-md mt-1" ${!isAccessible ? 'disabled' : ''} required>
                <option value="">Select SME...</option>
                ${smeUsers.map(sme => `
                  <option value="${sme.id}" ${request.assigned_sme_id === sme.id ? 'selected' : ''}>
                    ${sme.first_name} ${sme.last_name} (${sme.email})
                  </option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">DTA Signature Date/Time</label>
              <input type="datetime-local" name="dtaSignatureDateTime" 
                     class="w-full p-2 border border-[var(--border)] rounded-md mt-1" 
                     ${!isAccessible ? 'disabled' : ''} value="${request.dta_signature_date ? new Date(request.dta_signature_date * 1000).toISOString().slice(0, 16) : ''}">
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">DTA Signature Notes</label>
            <textarea name="dtaSignatureNotes" rows="3" class="w-full p-2 border border-[var(--border)] rounded-md mt-1" 
                      placeholder="DTA certification notes, compliance verification, etc." ${!isAccessible ? 'disabled' : ''}></textarea>
          </div>

          ${isAccessible && !isComplete ? `
            <div class="bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-lg p-4">
              <div class="text-sm text-[var(--info)]">
                ℹ️ By signing this transfer, you certify that all Section 4 procedures have been completed according to AFT requirements.
              </div>
            </div>
          ` : ''}

          ${isComplete ? `
            <div class="text-xs p-2 rounded bg-[var(--success)]/10 text-[var(--success)]">
              ✓ DTA signature completed on ${new Date(request.dta_signature_date * 1000).toLocaleString()}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private static getSubmitButtonText(currentStep: number, request: any): string {
    // If transfer is completed but not signed, allow signature
    if (request.transfer_completed_date && !request.dta_signature_date) {
      return 'Sign & Assign SME';
    }
    
    switch (currentStep) {
      case 1: return 'Record AV Scan Results';
      case 2: return 'Complete Transfer';
      case 3: return 'Sign & Assign SME';
      default: return '';
    }
  }

  private static renderNotFound(user: DTAUser): string {
    const content = `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-12 text-center">
        <div class="text-4xl mb-4">🔍</div>
        <h2 class="text-xl font-semibold mb-2">Transfer Request Not Found</h2>
        <p class="text-[var(--muted-foreground)] mb-6">The requested transfer could not be found or you don't have access to it.</p>
        <button onclick="window.location.href='/dta/active'" 
                class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
          Back to Active Transfers
        </button>
      </div>
    `;

    return DTANavigation.renderLayout(
      'Transfer Not Found',
      'Request not found',
      user,
      '/dta/active',
      content
    );
  }

  static getScript(): string {
    return `
      document.getElementById('transferForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());
        
        try {
          const response = await fetch('/api/dta/transfer-form', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          
          const result = await response.json();
          
          if (result.success) {
            alert('Transfer form updated successfully!');
            window.location.reload();
          } else {
            alert('Failed to update transfer: ' + result.error);
          }
        } catch (error) {
          console.error('Error submitting form:', error);
          alert('Failed to submit form. Please try again.');
        }
      });
      
      // Auto-save when transfer completion fields are filled
      document.addEventListener('DOMContentLoaded', function() {
        const transferDateField = document.querySelector('input[name="transferDateTime"]');
        const filesTransferredField = document.querySelector('input[name="filesTransferred"]');
        
        if (transferDateField && filesTransferredField) {
          const autoSaveTransfer = debounce(() => {
            if (transferDateField.value && filesTransferredField.value) {
              saveProgressSilent();
            }
          }, 2000);
          
          transferDateField.addEventListener('change', autoSaveTransfer);
          filesTransferredField.addEventListener('input', autoSaveTransfer);
        }
      });
      
      function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
          const later = () => {
            clearTimeout(timeout);
            func(...args);
          };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
        };
      }
      
      function saveProgress() {
        const form = document.getElementById('transferForm');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data.saveOnly = true;
        
        fetch('/api/dta/transfer-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            alert('Progress saved successfully!');
          } else {
            alert('Failed to save progress: ' + result.error);
          }
        })
        .catch(error => {
          console.error('Error saving progress:', error);
          alert('Failed to save progress. Please try again.');
        });
      }
      
      function saveProgressSilent() {
        const form = document.getElementById('transferForm');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data.saveOnly = true;
        
        fetch('/api/dta/transfer-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
          if (!result.success) {
            console.warn('Auto-save failed:', result.error);
          }
        })
        .catch(error => {
          console.warn('Auto-save error:', error);
        });
      }
    `;
  }
}
