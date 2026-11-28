$ErrorActionPreference = 'Stop'

$bootstrap = Join-Path (Split-Path -Parent $PSScriptRoot) 'bootstrap'
$root = "-chdir=$bootstrap"
$account = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0 -or $account -notmatch '^[0-9]{12}$') { throw 'Could not verify the AWS account.' }

terraform $root init -input=false
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap initialization failed.' }

$owned = @()
if (Test-Path -LiteralPath (Join-Path $bootstrap 'terraform.tfstate')) {
    $owned = @(terraform $root state list)
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect bootstrap state.' }
}
$existing = ''
if ($owned -notcontains 'aws_iam_openid_connect_provider.github[0]') {
    $expected = "arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com"
    $providers = aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output json
    if ($LASTEXITCODE -ne 0) { throw 'Could not check for an existing GitHub OIDC provider.' }
    if (($providers | ConvertFrom-Json) -contains $expected) {
        $audiences = aws iam get-open-id-connect-provider --open-id-connect-provider-arn $expected --query ClientIDList --output json
        if ($LASTEXITCODE -ne 0 -or ($audiences | ConvertFrom-Json) -notcontains 'sts.amazonaws.com') {
            throw 'The existing GitHub OIDC provider must include the sts.amazonaws.com audience.'
        }
        $existing = $expected
    }
}

terraform $root apply "-var=aws_account_id=$account" "-var=existing_github_oidc_provider_arn=$existing"
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap apply did not finish.' }
