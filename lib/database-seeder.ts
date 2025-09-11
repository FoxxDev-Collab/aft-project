// Database seeder for sample AFT requests with DTA assignments and media drives
import { getDb, generateRequestNumber, AFTStatus } from "./database-bun";

export function seedSampleRequests() {
  const db = getDb();
  
  try {
    // Check if sample requests already exist
    const existingRequests = db.query("SELECT COUNT(*) as count FROM aft_requests WHERE request_number LIKE 'AFT-SAMPLE-%'").get() as any;
    
    if (existingRequests.count > 0) {
      console.log("✓ Sample requests already exist, skipping seeding");
      return;
    }

    // Get user IDs for the seeder
    const requestorUser = db.query("SELECT id FROM users WHERE email = 'requestor@aft.gov'").get() as any;
    const approverUser = db.query("SELECT id FROM users WHERE email = 'issm@aft.gov'").get() as any;
    const dta1User = db.query("SELECT id FROM users WHERE email = 'dta@aft.gov'").get() as any;
    const dta2User = db.query("SELECT id FROM users WHERE email = 'dta2@aft.gov'").get() as any;
    const smeUser = db.query("SELECT id FROM users WHERE email = 'sme@aft.gov'").get() as any;
    const custodianUser = db.query("SELECT id FROM users WHERE email = 'custodian@aft.gov'").get() as any;

    // Get available media drives
    const mediaDrive1 = db.query("SELECT id FROM media_drives WHERE serial_number = 'MD-SSD-001-2024'").get() as any;
    const mediaDrive2 = db.query("SELECT id FROM media_drives WHERE serial_number = 'MD-SSD-002-2024'").get() as any;

    if (!requestorUser || !approverUser || !dta1User || !dta2User || !smeUser || !custodianUser) {
      console.error("Required users not found for seeding requests");
      return;
    }

    if (!mediaDrive1 || !mediaDrive2) {
      console.error("Required media drives not found for seeding requests");
      return;
    }

    // Sample Request 1 - High Priority Intelligence Data Transfer
    const request1Number = "AFT-SAMPLE-001-2024";
    const request1 = {
      request_number: request1Number,
      requestor_id: requestorUser.id,
      approver_id: approverUser.id,
      dta_id: dta1User.id,
      sme_id: smeUser.id,
      media_custodian_id: custodianUser.id,
      tpi_required: true,
      status: AFTStatus.PENDING_APPROVER,
      requestor_name: "Emily Clark",
      requestor_org: "Intelligence Analysis Division",
      requestor_phone: "555-0123",
      requestor_email: "requestor@aft.gov",
      transfer_purpose: "Critical intelligence data analysis for ongoing operation",
      transfer_type: "high_to_low",
      classification: "SECRET//NOFORN",
      caveat_info: "Contains sensitive source information",
      data_description: "Geospatial intelligence datasets and analysis reports from classified systems",
      source_system: "SIPR Network - Intelligence Analysis Workstation",
      source_location: "Building A, Room 205, Secure Facility",
      source_contact: "John Mitchell",
      source_phone: "555-0456",
      source_email: "j.mitchell@intel.gov",
      dest_system: "Unclassified Analysis Environment",
      dest_location: "Building B, Room 101, Open Facility",
      dest_contact: "Sarah Johnson",
      dest_phone: "555-0789",
      dest_email: "s.johnson@analysis.gov",
      data_format: "Compressed archive containing GeoTIFF, KML, and PDF files",
      data_size: "2.3 GB",
      transfer_method: "Physical Media Transfer",
      encryption: "AES-256 with DoD-approved algorithms",
      compression_required: true,
      files_list: "intel_report_2024_q1.pdf (45MB), geospatial_data.zip (1.8GB), analysis_summary.docx (12MB), metadata.xml (2MB)",
      additional_file_list_attached: true,
      selected_drive_id: mediaDrive1.id,
      requested_start_date: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60), // 7 days ago
      requested_end_date: Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60), // 3 days from now
      urgency_level: "high",
      transfer_notes: "High priority transfer for time-sensitive intelligence analysis",
      verification_type: "Hash verification and digital signature validation",
      priority: "high",
      file_name: "intel_package_q1_2024.zip",
      file_size: "2.3 GB",
      file_type: "Compressed Archive",
      file_hash: "sha256:a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
      justification: "Required for ongoing intelligence analysis to support critical national security operations",
      description: "Quarterly intelligence data package containing geospatial analysis and threat assessments",
      origination_scan_performed: false,
      origination_files_scanned: null,
      origination_threats_found: 0,
      destination_scan_performed: false,
      tpi_maintained: true
    };

    // Sample Request 2 - Research Data Transfer
    const request2Number = "AFT-SAMPLE-002-2024";
    const request2 = {
      request_number: request2Number,
      requestor_id: requestorUser.id,
      approver_id: approverUser.id,
      dta_id: dta2User.id,
      sme_id: smeUser.id,
      media_custodian_id: custodianUser.id,
      tpi_required: false,
      status: AFTStatus.PENDING_APPROVER,
      requestor_name: "Emily Clark",
      requestor_org: "Research and Development Division",
      requestor_phone: "555-0123",
      requestor_email: "requestor@aft.gov",
      transfer_purpose: "Scientific research data for collaborative analysis project",
      transfer_type: "low_to_high",
      classification: "UNCLASSIFIED//FOUO",
      data_description: "Laboratory test results and experimental data from unclassified research facility",
      source_system: "Research Lab Network - Data Collection System",
      source_location: "Research Facility C, Lab 3",
      source_contact: "Dr. Michael Chen",
      source_phone: "555-0321",
      source_email: "m.chen@research.gov",
      dest_system: "Classified Research Analysis Network",
      dest_location: "Secure Research Facility, Building D",
      dest_contact: "Dr. Lisa Rodriguez",
      dest_phone: "555-0654",
      dest_email: "l.rodriguez@secure.gov",
      data_format: "CSV files, Excel spreadsheets, and PDF reports",
      data_size: "850 MB",
      transfer_method: "Physical Media Transfer",
      encryption: "AES-256 encryption",
      compression_required: false,
      files_list: "experiment_data_2024.csv (450MB), analysis_results.xlsx (200MB), research_report.pdf (180MB), supplemental_docs.zip (20MB)",
      additional_file_list_attached: false,
      selected_drive_id: mediaDrive2.id,
      requested_start_date: Math.floor(Date.now() / 1000) - (3 * 24 * 60 * 60), // 3 days ago
      requested_end_date: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days from now
      urgency_level: "normal",
      transfer_notes: "Standard research data transfer for collaborative project",
      verification_type: "Checksum verification",
      priority: "normal",
      file_name: "research_data_package_2024.zip",
      file_size: "850 MB",
      file_type: "Data Package",
      file_hash: "sha256:f1e2d3c4b5a6987654321098765432109876543210fedcba0987654321fedcba",
      justification: "Essential research data required for joint analysis project with classified research facility",
      description: "Experimental data and analysis results from unclassified laboratory research",
      origination_scan_performed: false,
      origination_files_scanned: null,
      origination_threats_found: 0,
      destination_scan_performed: false,
      tpi_maintained: false
    };

    // Insert the sample requests
    const insertQuery = `
      INSERT INTO aft_requests (
        request_number, requestor_id, approver_id, dta_id, sme_id, media_custodian_id,
        tpi_required, status, requestor_name, requestor_org, requestor_phone, requestor_email,
        transfer_purpose, transfer_type, classification, caveat_info, data_description,
        source_system, source_location, source_contact, source_phone, source_email,
        dest_system, dest_location, dest_contact, dest_phone, dest_email,
        data_format, data_size, transfer_method, encryption, compression_required,
        files_list, additional_file_list_attached, selected_drive_id,
        requested_start_date, requested_end_date, urgency_level,
        transfer_notes, verification_type,
        priority, file_name, file_size, file_type, file_hash, justification, description,
        origination_scan_performed, origination_files_scanned, origination_threats_found,
        destination_scan_performed, tpi_maintained
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `;

    // Insert Request 1
    db.query(insertQuery).run(
      request1.request_number, request1.requestor_id, request1.approver_id, request1.dta_id, request1.sme_id, request1.media_custodian_id,
      request1.tpi_required, request1.status, request1.requestor_name, request1.requestor_org, request1.requestor_phone, request1.requestor_email,
      request1.transfer_purpose, request1.transfer_type, request1.classification, request1.caveat_info, request1.data_description,
      request1.source_system, request1.source_location, request1.source_contact, request1.source_phone, request1.source_email,
      request1.dest_system, request1.dest_location, request1.dest_contact, request1.dest_phone, request1.dest_email,
      request1.data_format, request1.data_size, request1.transfer_method, request1.encryption, request1.compression_required,
      request1.files_list, request1.additional_file_list_attached, request1.selected_drive_id,
      request1.requested_start_date, request1.requested_end_date, request1.urgency_level,
      request1.transfer_notes, request1.verification_type,
      request1.priority, request1.file_name, request1.file_size, request1.file_type, request1.file_hash, request1.justification, request1.description,
      request1.origination_scan_performed, request1.origination_files_scanned, request1.origination_threats_found,
      request1.destination_scan_performed, request1.tpi_maintained
    );

    // Insert Request 2
    db.query(insertQuery).run(
      request2.request_number, request2.requestor_id, request2.approver_id, request2.dta_id, request2.sme_id, request2.media_custodian_id,
      request2.tpi_required, request2.status, request2.requestor_name, request2.requestor_org, request2.requestor_phone, request2.requestor_email,
      request2.transfer_purpose, request2.transfer_type, request2.classification, null, request2.data_description,
      request2.source_system, request2.source_location, request2.source_contact, request2.source_phone, request2.source_email,
      request2.dest_system, request2.dest_location, request2.dest_contact, request2.dest_phone, request2.dest_email,
      request2.data_format, request2.data_size, request2.transfer_method, request2.encryption, request2.compression_required,
      request2.files_list, request2.additional_file_list_attached, request2.selected_drive_id,
      request2.requested_start_date, request2.requested_end_date, request2.urgency_level,
      request2.transfer_notes, request2.verification_type,
      request2.priority, request2.file_name, request2.file_size, request2.file_type, request2.file_hash, request2.justification, request2.description,
      request2.origination_scan_performed, request2.origination_files_scanned, request2.origination_threats_found,
      request2.destination_scan_performed, request2.tpi_maintained
    );

    // Media drives remain available since requests are not yet approved

    // Add audit log entries for the requests
    const auditEntries = [
      {
        request_id: 1, // Request 1 will have ID 1 if this is the first seeding
        user_id: requestorUser.id,
        action: 'REQUEST_CREATED',
        new_status: AFTStatus.DRAFT,
        notes: 'Initial request creation'
      },
      {
        request_id: 1,
        user_id: requestorUser.id,
        action: 'STATUS_CHANGED',
        old_status: AFTStatus.DRAFT,
        new_status: AFTStatus.PENDING_APPROVER,
        notes: 'Request submitted for ISSM approval'
      },
      {
        request_id: 2,
        user_id: requestorUser.id,
        action: 'REQUEST_CREATED',
        new_status: AFTStatus.DRAFT,
        notes: 'Initial request creation'
      },
      {
        request_id: 2,
        user_id: requestorUser.id,
        action: 'STATUS_CHANGED',
        old_status: AFTStatus.DRAFT,
        new_status: AFTStatus.PENDING_APPROVER,
        notes: 'Request submitted for ISSM approval'
      }
    ];

    // Get the actual request IDs that were inserted
    const insertedRequest1 = db.query("SELECT id FROM aft_requests WHERE request_number = ?").get(request1Number) as any;
    const insertedRequest2 = db.query("SELECT id FROM aft_requests WHERE request_number = ?").get(request2Number) as any;

    if (insertedRequest1 && insertedRequest2) {
      // Update audit entries with correct request IDs
      auditEntries.forEach((entry, index) => {
        const requestId = index < 3 ? insertedRequest1.id : insertedRequest2.id;
        entry.request_id = requestId;
        
        db.query(`
          INSERT INTO aft_audit_log (request_id, user_id, action, old_status, new_status, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          entry.request_id,
          entry.user_id,
          entry.action,
          entry.old_status || null,
          entry.new_status,
          entry.notes,
          Math.floor(Date.now() / 1000) - ((auditEntries.length - index) * 60 * 60) // Stagger timestamps
        );
      });
    }

    console.log("✓ Successfully seeded 2 sample AFT requests:");
    console.log(`  - ${request1Number}: High priority intelligence transfer (DTA: Mike Johnson, Drive: MD-SSD-001-2024)`);
    console.log(`  - ${request2Number}: Research data transfer (DTA: Lisa Brown, Drive: MD-SSD-002-2024)`);
    console.log("✓ Updated media drive assignments and audit logs");

  } catch (error) {
    console.error("Error seeding sample requests:", error);
    throw error;
  }
}

// Run seeder on import if not already run
try {
  seedSampleRequests();
} catch (error) {
  console.error("Failed to run sample request seeder:", error);
}
