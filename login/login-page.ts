// Login Page - Secure authentication interface
export class LoginPage {
  static render(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AFT - Login</title>
    <link rel="stylesheet" href="/globals.css">
</head>
<body>
    <div class="login-container">
        <div class="login-box">
            <div class="login-header">
                <h1>Assured File Transfer</h1>
                <p>Secure Data Transfer System</p>
            </div>
            
            <form id="loginForm">
                <div class="form-group">
                    <label for="email">Email:</label>
                    <input type="email" id="email" name="email" required placeholder="Enter your email">
                </div>
                
                <div class="form-group">
                    <label for="password">Password:</label>
                    <input type="password" id="password" name="password" required placeholder="Enter your password">
                </div>
                
                <button type="submit" class="login-btn">Login</button>
                
                <div id="error-message" class="error-message" style="display: none;"></div>
            </form>
            
            <div class="system-info">
                <h3 style="color: var(--primary); margin-bottom: 12px; font-size: 14px;">Test Accounts:</h3>
                <p><strong>Admin:</strong> admin@aft.gov / admin123</p>
                <p><strong>DAO:</strong> dao@aft.gov / password123</p>
                <p><strong>Approver:</strong> issm@aft.gov / password123</p>
                <p><strong>DTA:</strong> dta@aft.gov / password123</p>
            </div>
        </div>
    </div>
    
    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('error-message');
            
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    window.location.href = '/dashboard';
                } else {
                    errorDiv.textContent = result.message || 'Login failed';
                    errorDiv.style.display = 'block';
                    
                    // Show remaining attempts if provided
                    if (result.remainingAttempts !== undefined) {
                        errorDiv.textContent += \` (\${result.remainingAttempts} attempts remaining)\`;
                    }
                }
            } catch (error) {
                errorDiv.textContent = 'Network error. Please try again.';
                errorDiv.style.display = 'block';
            }
        });
    </script>
</body>
</html>`;
  }
}