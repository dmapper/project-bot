function ALWAYS_TRUE () { return true }

module.exports = [
  { ruleName: 'added_reviewer', webhookName: 'pull_request.review_requested', ruleMatcher: ALWAYS_TRUE }, // See https://developer.github.com/v3/activity/events/types/#pullrequestevent to get the reviewer
  {
    createsACard: true,
    ruleName: 'new_issue',
    webhookName: 'issues.opened',
    ruleMatcher: async function (logger, context, ruleArgs) {
      if (ruleArgs.length > 0) {
        // Verify that it matches one of the repositories listed
        const repoNames = ruleArgs
        return repoNames.indexOf(context.payload.repository.name) >= 0
      } else {
        return false // ignore if repo is not specified
      }
    }
  },
  {
    createsACard: true,
    ruleName: 'new_pullrequest',
    webhookName: 'pull_request.opened',
    ruleMatcher: async function (logger, context, ruleArgs) {
      if (ruleArgs.length > 0) {
        // Verify that it matches one of the repositories listed
        const repoNames = ruleArgs

        return repoNames.indexOf(context.payload.repository.name) >= 0
      } else {
        return false // ignore if repo is not specified
      }
    }
  }
 ]
