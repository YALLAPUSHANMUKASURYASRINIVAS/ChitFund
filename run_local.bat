@echo off
echo ===================================================
echo   ChitLite - Local Environment Setup & Run Script
echo ===================================================
echo.

echo [1/4] Installing npm dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo Error: npm install failed. Make sure Node.js is installed.
    pause
    exit /b %ERRORLEVEL%
)
echo Dependencies installed successfully.
echo.

echo [2/4] Setting up environment configuration...
if not exist .env (
    echo Creating .env file from template...
    echo # Server Configuration > .env
    echo PORT=5000 >> .env
    echo NODE_ENV=development >> .env
    echo. >> .env
    echo # Database Configuration >> .env
    echo # Replace the connection string with your local PostgreSQL URL >> .env
    echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chitfund_db >> .env
    echo. >> .env
    echo # JWT Configuration >> .env
    echo JWT_SECRET=change_me_to_a_secure_random_string_123456 >> .env
    echo JWT_EXPIRE=7d >> .env
    echo. >> .env
    echo # Email Configuration (Brevo API Key) >> .env
    echo EMAIL_USER=your_verified_email@gmail.com >> .env
    echo BREVO_API_KEY=your_brevo_api_key_here >> .env
    echo. >> .env
    echo # Twilio SMS Configuration >> .env
    echo TWILIO_ACCOUNT_SID=your_twilio_sid >> .env
    echo TWILIO_AUTH_TOKEN=your_twilio_token >> .env
    echo TWILIO_PHONE_NUMBER=your_twilio_phone >> .env
    echo. >> .env
    echo # Razorpay Configuration >> .env
    echo RAZORPAY_KEY_ID=your_razorpay_key_id >> .env
    echo RAZORPAY_KEY_SECRET=your_razorpay_key_secret >> .env
    echo. >> .env
    echo FRONTEND_URL=http://localhost:5000 >> .env
    echo.
    echo Created a template .env file.
    echo IMPORTANT: Please open the .env file and update your DATABASE_URL and API credentials!
) else (
    echo .env file already exists. Skipping creation.
)
echo.

echo [3/4] Initializing Database tables ^& Default admin...
echo Running database setup/seed (node reset_owner.js)...
call node reset_owner.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo WARNING: Database initialization failed.
    echo Make sure your PostgreSQL server is running and the connection string in .env is correct.
    echo.
) else (
    echo Database initialized successfully.
)
echo.

echo [4/4] Starting the server...
echo The app will run at http://localhost:5000
echo.
call npm start
pause
