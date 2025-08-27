export class CICDConfigGenerator {
  generateConfig(platform: string): string {
    switch (platform.toLowerCase()) {
      case 'github':
        return this.generateGitHubActions();
      case 'gitlab':
        return this.generateGitLabCI();
      case 'jenkins':
        return this.generateJenkinsfile();
      case 'azure':
        return this.generateAzureDevOps();
      case 'circleci':
        return this.generateCircleCI();
      default:
        return this.generateGitHubActions();
    }
  }

  getConfigFilename(platform: string): string {
    switch (platform.toLowerCase()) {
      case 'github':
        return '.github/workflows/playwright.yml';
      case 'gitlab':
        return '.gitlab-ci.yml';
      case 'jenkins':
        return 'Jenkinsfile';
      case 'azure':
        return 'azure-pipelines.yml';
      case 'circleci':
        return '.circleci/config.yml';
      default:
        return '.github/workflows/playwright.yml';
    }
  }

  private generateGitHubActions(): string {
    return `name: Playwright Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    
    steps:
    - uses: actions/checkout@v4
    
    - uses: actions/setup-node@v4
      with:
        node-version: 18
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps \${{ matrix.browser }}
    
    - name: Run Playwright tests
      run: npx playwright test --project=\${{ matrix.browser }}
      env:
        PLAYWRIGHT_JUNIT_OUTPUT_NAME: results.xml
    
    - name: Upload test results
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report-\${{ matrix.browser }}
        path: |
          playwright-report/
          test-results/
        retention-days: 30
    
    - name: Publish Test Results
      uses: dorny/test-reporter@v1
      if: success() || failure()
      with:
        name: Playwright Tests (\${{ matrix.browser }})
        path: results.xml
        reporter: jest-junit

  deploy-report:
    needs: test
    runs-on: ubuntu-latest
    if: always()
    steps:
    - name: Download artifacts
      uses: actions/download-artifact@v4
      
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      with:
        github_token: \${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./playwright-report`;
  }

  private generateGitLabCI(): string {
    return `stages:
  - test
  - report

variables:
  npm_config_cache: "$CI_PROJECT_DIR/.npm"
  PLAYWRIGHT_BROWSERS_PATH: "$CI_PROJECT_DIR/ms-playwright"

cache:
  paths:
    - .npm/
    - node_modules/
    - ms-playwright/

playwright-tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.40.0-focal
  parallel:
    matrix:
      - BROWSER: [chromium, firefox, webkit]
  script:
    - npm ci
    - npx playwright test --project=$BROWSER
  artifacts:
    when: always
    paths:
      - playwright-report/
      - test-results/
    expire_in: 1 week
    reports:
      junit: results.xml

deploy-report:
  stage: report
  image: alpine:latest
  dependencies:
    - playwright-tests
  script:
    - echo "Deploying test report..."
  artifacts:
    paths:
      - playwright-report/
  only:
    - main`;
  }

  private generateJenkinsfile(): string {
    return `pipeline {
    agent any
    
    tools {
        nodejs '18'
    }
    
    environment {
        CI = 'true'
        PLAYWRIGHT_BROWSERS_PATH = './ms-playwright'
    }
    
    stages {
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
                sh 'npx playwright install --with-deps'
            }
        }
        
        stage('Run Tests') {
            parallel {
                stage('Chromium') {
                    steps {
                        sh 'npx playwright test --project=chromium'
                    }
                    post {
                        always {
                            publishTestResults testResultsPattern: 'results.xml'
                        }
                    }
                }
                stage('Firefox') {
                    steps {
                        sh 'npx playwright test --project=firefox'
                    }
                    post {
                        always {
                            publishTestResults testResultsPattern: 'results.xml'
                        }
                    }
                }
                stage('WebKit') {
                    steps {
                        sh 'npx playwright test --project=webkit'
                    }
                    post {
                        always {
                            publishTestResults testResultsPattern: 'results.xml'
                        }
                    }
                }
            }
        }
    }
    
    post {
        always {
            publishHTML([
                allowMissing: false,
                alwaysLinkToLastBuild: false,
                keepAll: true,
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright Test Report'
            ])
            
            archiveArtifacts artifacts: 'test-results/**/*', allowEmptyArchive: true
        }
        
        failure {
            emailext (
                subject: "Playwright Tests Failed: \${env.JOB_NAME} - \${env.BUILD_NUMBER}",
                body: "Test execution failed. Check the report for details.",
                to: "\${env.CHANGE_AUTHOR_EMAIL}"
            )
        }
    }
}`;
  }

  private generateAzureDevOps(): string {
    return `trigger:
- main
- develop

pool:
  vmImage: 'ubuntu-latest'

variables:
  npm_config_cache: $(Pipeline.Workspace)/.npm

strategy:
  matrix:
    chromium:
      browserName: 'chromium'
    firefox:
      browserName: 'firefox'
    webkit:
      browserName: 'webkit'

steps:
- task: NodeTool@0
  inputs:
    versionSpec: '18'
  displayName: 'Install Node.js'

- task: Cache@2
  inputs:
    key: 'npm | "$(Agent.OS)" | package-lock.json'
    restoreKeys: |
      npm | "$(Agent.OS)"
    path: $(npm_config_cache)
  displayName: 'Cache npm'

- script: |
    npm ci
  displayName: 'Install dependencies'

- script: |
    npx playwright install --with-deps $(browserName)
  displayName: 'Install Playwright browsers'

- script: |
    npx playwright test --project=$(browserName)
  displayName: 'Run Playwright tests'

- task: PublishTestResults@2
  condition: always()
  inputs:
    testResultsFormat: 'JUnit'
    testResultsFiles: 'results.xml'
    testRunTitle: 'Playwright Tests ($(browserName))'

- task: PublishHtmlReport@1
  condition: always()
  inputs:
    reportDir: 'playwright-report'
    tabName: 'Playwright Report'`;
  }

  private generateCircleCI(): string {
    return `version: 2.1

orbs:
  node: circleci/node@5.0.2

executors:
  playwright-executor:
    docker:
      - image: mcr.microsoft.com/playwright:v1.40.0-focal
    working_directory: ~/project

jobs:
  test:
    executor: playwright-executor
    parallelism: 3
    parameters:
      browser:
        type: string
    steps:
      - checkout
      - node/install-packages:
          pkg-manager: npm
      - run:
          name: Install Playwright browsers
          command: npx playwright install --with-deps << parameters.browser >>
      - run:
          name: Run Playwright tests
          command: npx playwright test --project=<< parameters.browser >>
      - store_test_results:
          path: test-results
      - store_artifacts:
          path: playwright-report
          destination: playwright-report-<< parameters.browser >>

workflows:
  test-workflow:
    jobs:
      - test:
          matrix:
            parameters:
              browser: ["chromium", "firefox", "webkit"]`;
  }
}