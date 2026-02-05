// AWS Cognito Configuration
// Replace these values with your actual AWS Cognito User Pool details
const cognitoConfig = {
    region: 'ap-southeast-1',
    userPoolId: 'ap-southeast-1_jTaPOwjrn',
    userPoolWebClientId: '30ltfkbjtl7iee2210csl2ftad',
};

// Initialize Amplify Auth (this will be used by all pages)
if (typeof Amplify !== 'undefined') {
    Amplify.configure({
        Auth: {
            region: cognitoConfig.region,
            userPoolId: cognitoConfig.userPoolId,
            userPoolWebClientId: cognitoConfig.userPoolWebClientId,
        }
    });
}
