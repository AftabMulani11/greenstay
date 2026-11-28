#!/usr/bin/env bash
set -euo pipefail
umask 077

tf() {
  terraform -chdir=infra "$@"
}

init_remote() {
  : "${TF_STATE_BUCKET:?Set the TF_STATE_BUCKET repository variable}"
  : "${TF_VAR_aws_account_id:?Set the AWS_ACCOUNT_ID repository variable}"
  : "${TF_VAR_ses_sender_email:?Set the SES_SENDER_EMAIL repository secret}"
  [[ "$TF_STATE_BUCKET" == "greenstay-${TF_VAR_aws_account_id}-us-east-1-tfstate" ]]
  export TF_VAR_workload_permissions_boundary_arn="arn:aws:iam::${TF_VAR_aws_account_id}:policy/greenstay-workload-boundary"
  cp infra/backend.s3.tf.example infra/backend.s3.tf
  tf init -input=false -lockfile=readonly "-backend-config=bucket=$TF_STATE_BUCKET"
}

make_plan() {
  local file="$1"
  shift
  rm -f "infra/$file"
  tf plan -input=false -lock-timeout=5m -no-color "-out=$file" "$@" > "$RUNNER_TEMP/greenstay-plan.log"
}

print_plan() {
  local file="$1"
  tf show -json "$file" |
    jq -r '
      (.resource_changes // []) | map(select(.change.actions != ["no-op"] and .mode == "managed"))
      | if length == 0 then "No managed resource changes." else
          sort_by(.address)[] | "\(.change.actions | join(", "))  \(.address)"
        end
    '
}

bootstrap_plan() {
  make_plan bootstrap.tfplan \
    -target=aws_ecr_repository.backend \
    -target=aws_s3_bucket_public_access_block.private

  # Bootstrap only prepares the publish destinations.
  tf show -json bootstrap.tfplan | jq -e '
    all(.resource_changes[]? | select(.mode == "managed");
      .change.actions == ["no-op"] or .change.actions == ["create"])
  ' > /dev/null
}

bootstrap_fingerprint() {
  tf show -json bootstrap.tfplan |
    jq -cS '[(.resource_changes // [])[] | select(.mode == "managed" and .change.actions != ["no-op"]) |
      {address, actions: .change.actions, after: .change.after}] | sort_by(.address)' |
    sha256sum | cut -d' ' -f1
}

init_remote

case "${1:-}" in
  pr-plan)
    export TF_VAR_backend_image_digest
    TF_VAR_backend_image_digest="$(tf output -raw backend_image_digest 2>/dev/null || true)"
    TF_VAR_backend_image_digest="${TF_VAR_backend_image_digest:-sha256:0000000000000000000000000000000000000000000000000000000000000000}"
    export TF_VAR_frontend_release
    TF_VAR_frontend_release="$(tf output -raw frontend_release 2>/dev/null || true)"
    TF_VAR_frontend_release="${TF_VAR_frontend_release:-preview-only}"
    make_plan preview.tfplan
    { printf '### Terraform PR preview\n\n'; print_plan preview.tfplan | sed 's/^/- /'; } >> "$GITHUB_STEP_SUMMARY"
    ;;
  bootstrap-preview)
    bootstrap_plan
    printf 'fingerprint=%s\n' "$(bootstrap_fingerprint)" >> "$GITHUB_OUTPUT"
    { printf '### Artifact destinations\n\n'; print_plan bootstrap.tfplan | sed 's/^/- /'; } >> "$GITHUB_STEP_SUMMARY"
    ;;
  publish)
    : "${BOOTSTRAP_FINGERPRINT:?Missing reviewed bootstrap preview}"
    : "${GITHUB_SHA:?Missing release commit}"
    [[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]
    bootstrap_plan
    [[ "$(bootstrap_fingerprint)" == "$BOOTSTRAP_FINGERPRINT" ]] || {
      echo 'Artifact destinations changed after review. Start a new deployment.'
      exit 1
    }
    if [[ "$(print_plan bootstrap.tfplan)" != 'No managed resource changes.' ]] ||
      ! tf output -raw ecr_repository_url > /dev/null ||
      ! tf output -raw frontend_bucket_name > /dev/null; then
      tf apply -input=false -auto-approve -lock-timeout=5m bootstrap.tfplan
    fi

    repository="$(tf output -raw ecr_repository_url)"
    bucket="$(tf output -raw frontend_bucket_name)"
    repository_name="${repository#*/}"
    registry="${repository%%/*}"
    digest_file="$RUNNER_TEMP/greenstay-image-digest"
    if ! aws ecr describe-images --repository-name "$repository_name" --image-ids "imageTag=$GITHUB_SHA" \
      --query 'imageDetails[0].imageDigest' --output text > "$digest_file" 2> "$RUNNER_TEMP/greenstay-ecr-error"; then
      if ! grep -q 'ImageNotFoundException' "$RUNNER_TEMP/greenstay-ecr-error"; then
        cat "$RUNNER_TEMP/greenstay-ecr-error" >&2
        exit 1
      fi
      aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
      docker build --platform linux/amd64 -f DevOps/Dockerfile.backend -t "$repository:$GITHUB_SHA" .
      docker push "$repository:$GITHUB_SHA"
      aws ecr describe-images --repository-name "$repository_name" --image-ids "imageTag=$GITHUB_SHA" \
        --query 'imageDetails[0].imageDigest' --output text > "$digest_file"
    fi
    export TF_VAR_backend_image_digest
    TF_VAR_backend_image_digest="$(cat "$digest_file")"
    [[ "$TF_VAR_backend_image_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
    test -s build/index.html
    test -s build/asset-manifest.json
    aws s3 sync build/ "s3://$bucket/site/$GITHUB_SHA/" --only-show-errors
    export TF_VAR_frontend_release="$GITHUB_SHA"

    make_plan release.tfplan
    if ! tf show -json release.tfplan | jq -e '
      all(.resource_changes[]? | select(.mode == "managed" and (.change.actions | index("delete")));
        .type == "aws_ecs_task_definition" and (.change.actions | index("create")))
    ' > /dev/null; then
      echo 'This plan removes infrastructure beyond a task definition revision. Review it and use the operator workflow.' >&2
      exit 1
    fi
    plan_key="greenstay/plans/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.tar.gz"
    {
      printf '### Release `%s`\n\n' "$GITHUB_SHA"
      printf 'Backend digest `%s`\n\n' "$TF_VAR_backend_image_digest"
      print_plan release.tfplan | sed 's/^/- /'
      printf '\nFull plan for AWS reviewers: `s3://%s/%s` (release.plan.txt).\n' "$TF_STATE_BUCKET" "$plan_key"
      printf '\nApprove the production apply job after reviewing the changes.\n'
    } >> "$GITHUB_STEP_SUMMARY"
    cp "$RUNNER_TEMP/greenstay-plan.log" infra/release.plan.txt
    tar -czf "$RUNNER_TEMP/greenstay-release.tar.gz" -C infra release.tfplan release.plan.txt .terraform/greenstay-email.zip
    aws s3 cp "$RUNNER_TEMP/greenstay-release.tar.gz" "s3://$TF_STATE_BUCKET/$plan_key" --sse AES256 --only-show-errors
    printf 'plan_key=%s\n' "$plan_key" >> "$GITHUB_OUTPUT"
    printf 'plan_sha256=%s\n' "$(sha256sum "$RUNNER_TEMP/greenstay-release.tar.gz" | cut -d' ' -f1)" >> "$GITHUB_OUTPUT"
    ;;
  apply)
    : "${PLAN_KEY:?Missing reviewed release plan}"
    : "${PLAN_SHA256:?Missing reviewed plan checksum}"
    [[ "$PLAN_KEY" =~ ^greenstay/plans/[0-9]+-[0-9]+\.tar\.gz$ ]]
    [[ "$PLAN_SHA256" =~ ^[0-9a-f]{64}$ ]]
    aws s3 cp "s3://$TF_STATE_BUCKET/$PLAN_KEY" "$RUNNER_TEMP/greenstay-release.tar.gz" --only-show-errors
    printf '%s  %s\n' "$PLAN_SHA256" "$RUNNER_TEMP/greenstay-release.tar.gz" | sha256sum -c
    tar -xzf "$RUNNER_TEMP/greenstay-release.tar.gz" -C infra release.tfplan .terraform/greenstay-email.zip
    tf apply -input=false -auto-approve -lock-timeout=5m release.tfplan

    url="$(tf output -raw demo_url)"
    bucket="$(tf output -raw frontend_bucket_name)"
    aws s3 cp "s3://$bucket/site/$GITHUB_SHA/asset-manifest.json" "$RUNNER_TEMP/greenstay-assets.json" --only-show-errors
    mapfile -t entrypoints < <(jq -er '.entrypoints[]' "$RUNNER_TEMP/greenstay-assets.json")
    (( ${#entrypoints[@]} > 0 ))
    for attempt in {1..30}; do
      if curl -fsS --max-time 8 "$url/" -o "$RUNNER_TEMP/greenstay-index.html" &&
        curl -fsS --max-time 8 "$url/api/healthz" | jq -e '.status == "ok"' > /dev/null; then
        ready=true
        for asset in "${entrypoints[@]}"; do
          if ! grep -Fq "${asset#/}" "$RUNNER_TEMP/greenstay-index.html" ||
            ! curl -fsSI --max-time 8 "$url/${asset#/}" > /dev/null; then
            ready=false
            break
          fi
        done
        if [[ "$ready" == true ]]; then
          printf 'GreenStay is ready at %s\n' "$url" | tee -a "$GITHUB_STEP_SUMMARY"
          exit 0
        fi
      fi
      printf 'Waiting for the release and Flask health check (%s/30).\n' "$attempt"
      sleep 8
    done
    echo 'GreenStay did not serve the expected release and a healthy API.' >&2
    exit 1
    ;;
  *) echo 'Expected pr-plan, bootstrap-preview, publish, or apply.' >&2; exit 2 ;;
esac
