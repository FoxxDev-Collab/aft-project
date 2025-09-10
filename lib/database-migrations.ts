// Database migrations for approver functionality
import { getDb } from "./database-bun";

export function runApproverMigrations() {
  const db = getDb();
  
  try {
    // Add approver-specific columns to aft_requests if they don't exist
    const columns = db.query("PRAGMA table_info(aft_requests)").all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);
    
    // Add approver_email column if missing
    if (!columnNames.includes('approver_email')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN approver_email TEXT");
      console.log("✓ Added approver_email column to aft_requests");
    }
    
    // Add priority column if missing
    if (!columnNames.includes('priority')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN priority TEXT DEFAULT 'normal'");
      console.log("✓ Added priority column to aft_requests");
    }
    
    // Add file-related columns if missing
    if (!columnNames.includes('file_name')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN file_name TEXT");
      console.log("✓ Added file_name column to aft_requests");
    }
    
    if (!columnNames.includes('file_size')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN file_size TEXT");
      console.log("✓ Added file_size column to aft_requests");
    }
    
    if (!columnNames.includes('file_type')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN file_type TEXT");
      console.log("✓ Added file_type column to aft_requests");
    }
    
    if (!columnNames.includes('file_hash')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN file_hash TEXT");
      console.log("✓ Added file_hash column to aft_requests");
    }
    
    if (!columnNames.includes('justification')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN justification TEXT");
      console.log("✓ Added justification column to aft_requests");
    }
    
    if (!columnNames.includes('description')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN description TEXT");
      console.log("✓ Added description column to aft_requests");
    }
    
    // Create aft_request_history table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS aft_request_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL REFERENCES aft_requests(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        user_email TEXT NOT NULL,
        notes TEXT,
        old_value TEXT,
        new_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ Created/verified aft_request_history table");
    
    // Create index on request_id for better performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_aft_request_history_request_id 
      ON aft_request_history(request_id)
    `);
    
    // Update existing requests to have pending_approval status if they have submitted status
    const result = db.run(`
      UPDATE aft_requests 
      SET status = 'pending_approval' 
      WHERE status = 'submitted' OR status = 'pending_approver'
    `);
    
    if (result.changes > 0) {
      console.log(`✓ Updated ${result.changes} requests to pending_approval status`);
    }
    
    console.log("✓ Approver migrations completed successfully");
    
  } catch (error) {
    console.error("Error running approver migrations:", error);
    throw error;
  }
}

// Run migrations on import
runApproverMigrations();