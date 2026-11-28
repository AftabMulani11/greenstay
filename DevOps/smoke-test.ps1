$ErrorActionPreference = 'Stop'
$appUrl = 'http://127.0.0.1'
$mailUrl = 'http://127.0.0.1:8025'

function Send-Json($Path, $Data) {
    Invoke-RestMethod -Uri "$appUrl$Path" -Method Post -ContentType 'application/json' -Body ($Data | ConvertTo-Json -Compress)
}

function Assert-Smoke($Condition, $Message) {
    if (-not $Condition) { throw $Message }
}

$run = [guid]::NewGuid().ToString('N')
$hotelEmail = "hotel-$run@example.test"
$guestEmail = "guest-$run@example.test"
$password = [guid]::NewGuid().ToString('N')
$hotelSuffix = -join ($run.Substring(0, 3).ToCharArray() | ForEach-Object {
    [char](65 + [Convert]::ToInt32([string]$_, 16))
})

$frontendResponse = Invoke-WebRequest -Uri $appUrl -UseBasicParsing
Assert-Smoke ($frontendResponse.Content -match 'id="root"') 'The frontend did not serve the React app.'

$hotel = Send-Json '/api/hotel-registration' @{
    hotel_name = "Smoke $hotelSuffix"
    hotel_email = $hotelEmail
    password = $password
}
Assert-Smoke ($hotel.success -and $hotel.hotel_id) 'Hotel registration failed.'
$hotelId = $hotel.hotel_id
$login = Send-Json '/api/login' @{ type = 'hotel'; id = $hotelId; password = $password }
Assert-Smoke ($login.success -and $login.hotel_id -eq $hotelId) 'Hotel login failed.'

$booking = Send-Json '/api/guests' @{
    status = 'checked-in'
    hotel_id = $hotelId
    email = $guestEmail
    name = 'Smoke Guest'
    phone = '2025550140'
    room = '101'
    date = (Get-Date -Format 'yyyy-MM-dd')
    checkOutDate = (Get-Date).AddDays(1).ToString('yyyy-MM-dd')
}
Assert-Smoke ($booking.success -and $booking.bookingId) 'Guest check-in failed.'
$bookingId = $booking.bookingId
$guests = Invoke-RestMethod -Uri "$appUrl/api/guests/$hotelId"
Assert-Smoke ($guests | Where-Object { $_.bookingId -eq $bookingId -and $_.status -eq 'checked-in' }) 'The hotel dashboard did not list the active booking.'

$update = Send-Json '/api/guests' @{
    status = 'update-stats'
    hotel_id = $hotelId
    bookingId = $bookingId
    electricity = 1
    water = 5
    laundry = 0
    meals = 1
}
$portal = Invoke-RestMethod -Uri "$appUrl/api/guest-portal/$bookingId"
Assert-Smoke ($portal.guest_data.is_active -and $portal.guest_data.electricity -eq 1 -and $portal.guest_data.co2 -eq $update.co2) 'The guest portal did not show the saved usage.'

$checkout = Send-Json '/api/guests' @{
    status = 'checked-out'
    hotel_id = $hotelId
    bookingId = $bookingId
    electricity = 1
    water = 5
    laundry = 0
    meals = 1
}
Assert-Smoke ($checkout.status -eq 'Checked out') 'Guest checkout failed.'
$portal = Invoke-RestMethod -Uri "$appUrl/api/guest-portal/$bookingId"
Assert-Smoke ($portal.guest_data.status -eq 'checked-out' -and -not $portal.guest_data.is_active) 'The guest portal did not show the completed checkout.'

$guestLogin = Send-Json '/api/login' @{
    type = 'customer'
    guest_name = 'Smoke Guest'
    email = $guestEmail
    phone_number = '2025550140'
}
Assert-Smoke ($guestLogin.success -and $guestLogin.guest_data.bookingId -eq $bookingId) 'Guest login did not find the saved booking.'

$hotelCsv = Invoke-WebRequest -Uri "$appUrl/api/download/hotel/$hotelId" -UseBasicParsing
Assert-Smoke ($hotelCsv.Content -like "Booking ID,Name,Email,Room,Status,Check In,CO2 (kg)*$bookingId*") 'The hotel CSV did not contain the booking.'
$guestCsv = Invoke-WebRequest -Uri "$appUrl/api/download/guest" -Method Post -ContentType 'application/json' -Body (@{ email = $guestEmail } | ConvertTo-Json -Compress) -UseBasicParsing
Assert-Smoke ($guestCsv.Content -like "Hotel,Date,CO2 (kg),Electricity,Water*Smoke $hotelSuffix*") 'The guest CSV did not contain the stay.'

# SMTP can acknowledge messages before they are visible in the inbox.
for ($attempt = 0; $attempt -lt 10; $attempt++) {
    $inbox = Invoke-RestMethod -Uri "$mailUrl/api/v1/messages"
    $hotelMessages = @($inbox.messages | Where-Object { $_.To[0].Address -eq $hotelEmail })
    $guestMessages = @($inbox.messages | Where-Object { $_.To[0].Address -eq $guestEmail })
    if ($hotelMessages.Count -eq 1 -and $guestMessages.Count -eq 3) { break }
    Start-Sleep -Milliseconds 500
}
Assert-Smoke ($hotelMessages.Count -eq 1 -and $hotelMessages[0].Subject -like '*Registration Successful*') 'Mailpit did not capture the registration email.'
Assert-Smoke ($guestMessages.Count -eq 3) 'Mailpit did not capture all three guest emails.'
Assert-Smoke ($guestMessages | Where-Object { $_.Subject -like 'Welcome to the GreenStay Community*' }) 'Mailpit did not capture the guest welcome email.'

foreach ($subject in '*Your GreenStay Journey Begins', 'Thank You for Staying with*') {
    $message = $guestMessages | Where-Object { $_.Subject -like $subject }
    Assert-Smoke ($message) "Mailpit did not capture an email matching '$subject'."
    $captured = Invoke-RestMethod -Uri "$mailUrl/api/v1/message/$($message.ID)"
    Assert-Smoke ($captured.Text -like "*$bookingId*") 'A guest email did not contain the booking ID.'
}

Write-Output "Smoke test passed for hotel $hotelId and booking $bookingId. Mailpit captured four emails."
