param(
    [string]$SesSenderEmail
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Command)
    & $Command @args
    if ($LASTEXITCODE -ne 0) { throw "$Command exited with code $LASTEXITCODE." }
}

$repo = Split-Path -Parent $PSScriptRoot
$infra = Join-Path $repo 'infra'
$settingsPath = Join-Path $infra 'release.auto.tfvars.json'
$terraformRoot = "-chdir=$infra"

Push-Location $repo
try {
    $account = Invoke-Checked aws sts get-caller-identity --query Account --output text
    if ($account -notmatch '^[0-9]{12}$') { throw 'Could not determine the active AWS account.' }
    $settings = @{ aws_account_id = $account }
    if (Test-Path -LiteralPath $settingsPath) {
        $previous = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        if ($previous.aws_account_id -ne $account) { throw 'AWS credentials do not match the deployment account.' }
        if (!$SesSenderEmail) { $SesSenderEmail = $previous.ses_sender_email }
        $settings.backend_image_digest = $previous.backend_image_digest
        $settings.frontend_release = $previous.frontend_release
    }
    if ($SesSenderEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        throw 'Supply -SesSenderEmail with the email address used to verify SES.'
    }
    $settings.ses_sender_email = $SesSenderEmail
    [IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json))

    Invoke-Checked terraform $terraformRoot init -input=false
    $stamp = Get-Date -Format 'yyyyMMddHHmmss'
    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $release = "release-$stamp-$suffix"
    $frontendImage = "greenstay-frontend:$release"
    $frontendBuild = Join-Path $repo ".cache/$release"
    Invoke-Checked docker build --target build -f DevOps/Dockerfile.frontend -t $frontendImage .
    $container = Invoke-Checked docker create $frontendImage
    try {
        New-Item -ItemType Directory -Path $frontendBuild -Force | Out-Null
        Invoke-Checked docker cp "${container}:/app/build/." $frontendBuild
    } finally {
        docker rm $container | Out-Null
    }
    $manifest = Get-Content -LiteralPath (Join-Path $frontendBuild 'asset-manifest.json') -Raw | ConvertFrom-Json
    if (!$manifest.entrypoints -or !(Test-Path -LiteralPath (Join-Path $frontendBuild 'index.html'))) {
        throw 'The React build is incomplete.'
    }

    # The image and site need publish destinations before the full apply.
    $statePath = Join-Path $infra 'terraform.tfstate'
    $addresses = if (Test-Path -LiteralPath $statePath) { Invoke-Checked terraform $terraformRoot state list }
    if ($addresses -notcontains 'aws_ecr_repository.backend' -or
        $addresses -notcontains 'aws_s3_bucket_public_access_block.private["frontend"]') {
        Invoke-Checked terraform $terraformRoot apply '-target=aws_ecr_repository.backend' '-target=aws_s3_bucket_public_access_block.private'
    }
    $repository = Invoke-Checked terraform $terraformRoot output -raw ecr_repository_url
    $bucket = Invoke-Checked terraform $terraformRoot output -raw frontend_bucket_name
    $registry, $repositoryName = $repository -split '/', 2
    $image = "${repository}:$release"
    Invoke-Checked docker build --platform linux/amd64 -f DevOps/Dockerfile.backend -t $image .
    $registryPassword = Invoke-Checked aws ecr get-login-password --region us-east-1
    try {
        $registryPassword | docker login --username AWS --password-stdin $registry
        if ($LASTEXITCODE -ne 0) { throw 'Docker could not sign in to ECR.' }
    } finally {
        Remove-Variable registryPassword
    }
    Invoke-Checked docker push $image
    $digest = Invoke-Checked aws ecr describe-images --region us-east-1 --repository-name $repositoryName --image-ids "imageTag=$release" --query 'imageDetails[0].imageDigest' --output text
    if ($digest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Could not verify the image digest in ECR.' }
    Invoke-Checked aws s3 sync $frontendBuild "s3://$bucket/site/$release/" --region us-east-1 --only-show-errors

    $settings.backend_image_digest = $digest
    $settings.frontend_release = $release
    [IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json))
    Invoke-Checked terraform $terraformRoot apply

    $url = Invoke-Checked terraform $terraformRoot output -raw application_url
    Write-Host "Waiting for the React build and Flask API at $url"
    $deadline = (Get-Date).AddMinutes(5)
    while ((Get-Date) -lt $deadline) {
        try {
            $page = Invoke-WebRequest "$url/" -UseBasicParsing -TimeoutSec 8
            $health = Invoke-RestMethod "$url/api/healthz" -TimeoutSec 8
            $missing = $manifest.entrypoints | Where-Object { !$page.Content.Contains($_) }
            if ($health.status -eq 'ok' -and !$missing) {
                Write-Output "GreenStay is ready at $url"
                return
            }
        } catch {
            Write-Verbose $_.Exception.Message
        }
        Start-Sleep -Seconds 8
    }
    throw "Terraform finished, but the new website or API did not become ready at $url."
} finally {
    Pop-Location
}
