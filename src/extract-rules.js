const commonmark = require('commonmark')
const commonmarkParser = new commonmark.Parser()

// For parse out all the Automation Rules from Cards in a Project
module.exports = function extractAutomationRules (projects) {
  const automationRules = []

  projects.forEach((project) => {
    // skip org projects
    if (/github\.com\/orgs\//.test(project.url)) return

    let repoName = project.url.match(/github\.com\/[^\/]+\/([^\/]+)/)[1]
    project.columns.nodes.forEach((column) => {
      if (/Backlog$/i.test(column.name)) {
        automationRules.push({
          column,
          ruleName: 'new_issue',
          ruleArgs: [repoName]
        })
      }

      if (/On review$/i.test(column.name)) {
        automationRules.push({
          column,
          ruleName: 'new_pullrequest',
          ruleArgs: [repoName]
        })
        automationRules.push({
          column,
          ruleName: 'added_reviewer',
          ruleArgs: []
        })
      }
    })
  })

  return automationRules
}
