pipeline {
    agent any
    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
    }
    environment {
        COMPOSE_PROJECT_NAME = 'sibsomsserver'
        SERVER_ENV_FILE = '/var/jenkins_home/env-files/sibs-oms-server.env'
        WORKSPACE_ENV_FILE = 'sibs-oms-server.env'
    }
    stages {
        stage('Checkout') {
            steps { checkout scm }
        }
        stage('Prepare Environment') {
            steps {
                sh '''
                    set -eu
                    test -f "$SERVER_ENV_FILE"
                    cp "$SERVER_ENV_FILE" "$WORKSPACE/$WORKSPACE_ENV_FILE"
                    chmod 600 "$WORKSPACE/$WORKSPACE_ENV_FILE"
                '''
            }
        }
        stage('Test') {
            steps {
                sh '''
                    set -eu
                    npm ci
                    npm run check
                    npm test
                '''
            }
        }
        stage('Validate') {
            steps {
                sh 'SERVER_ENV_FILE="$WORKSPACE_ENV_FILE" docker compose -p "$COMPOSE_PROJECT_NAME" config >/dev/null'
            }
        }
        stage('Build') {
            steps {
                sh 'SERVER_ENV_FILE="$WORKSPACE_ENV_FILE" docker compose -p "$COMPOSE_PROJECT_NAME" build'
            }
        }
        stage('Deploy') {
            steps {
                sh 'SERVER_ENV_FILE="$WORKSPACE_ENV_FILE" docker compose -p "$COMPOSE_PROJECT_NAME" up -d --force-recreate --remove-orphans'
            }
        }
        stage('Verify Health') {
            steps {
                sh '''
                    set -eu
                    for attempt in $(seq 1 60); do
                        status=$(docker inspect SiBS-OMS-Server \
                          --format='{{.State.Health.Status}}' 2>/dev/null || true)
                        if [ "$status" = "healthy" ]; then
                            docker inspect SiBS-OMS-Server \
                              --format='Status={{.State.Status}} Health={{.State.Health.Status}}'
                            exit 0
                        fi
                        if [ "$status" = "unhealthy" ]; then
                            docker logs --tail 100 SiBS-OMS-Server || true
                            exit 1
                        fi
                        sleep 2
                    done
                    docker logs --tail 100 SiBS-OMS-Server || true
                    echo "Container did not become healthy within 120 seconds."
                    exit 1
                '''
            }
        }
    }
    post {
        always { sh 'rm -f "$WORKSPACE/sibs-oms-server.env"' }
    }
}
