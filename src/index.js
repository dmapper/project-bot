const extractAutomationRules = require('./extract-rules')
const automationCommands = require('./commands')

// `await sleep(1000)` syntax
async function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}
// Often, there is a delay between the webhook firing and GaphQL updating
async function retryQuery (context, query, args) {
  try {
    return await context.github.graphql(query, args)
  } catch (err) {
    await sleep(1000)
    return context.github.graphql(query, args)
  }
}

// Common GraphQL Fragment for getting the Automation Cards out of the bottom of every Column in a Project
const PROJECT_FRAGMENT = `
  name
  id
  url
  columns(first: 50) {
    totalCount
    nodes {
      id
      url
      name
    }
  }
`

module.exports = (robot) => {
  const logger = robot.log.child({ name: 'project-bot' })
  // Increase the maxListenerCount by the number of automationCommands
  // because we register a bunch of listeners
  robot.events.setMaxListeners(robot.events.getMaxListeners() + automationCommands.length)
  logger.info(`Starting up`)

  // Register all of the automation commands
  automationCommands.forEach(({ createsACard, webhookName, ruleName, ruleMatcher }) => {
    logger.trace(`Attaching listener for ${webhookName}`)
    robot.on(webhookName, async function (context) {
      const issueUrl = context.payload.issue ? context.payload.issue.html_url : context.payload.pull_request.html_url.replace('/pull/', '/issues/')
      logger.trace(`Event received for ${webhookName}`)

      logger.trace(`Modify PR by adding the URL to test it`)
      if (webhookName === 'pull_request.opened') {
        let branchName = context.payload.pull_request.head.ref
        let testUrl = `${branchName}.${process.env.TEST_DOMAIN}`
        await context.github.pullRequests.update(context.issue({
          body: `Test here: [${testUrl}](https://${testUrl})\n\n-----${context.payload.pull_request.body}`
        }))
      }

      // A couple commands occur when a new Issue or Pull Request is created.
      // In those cases, a new Card needs to be created, rather than moving an existing card.
      if (createsACard) {
        const graphResult = await retryQuery(context, `
          query getAllProjectCards($issueUrl: URI!) {
            resource(url: $issueUrl) {
              ... on Issue {
                id
                repository {
                  projects(first: 10, states: [OPEN]) {
                    nodes {
                      ${PROJECT_FRAGMENT}
                    }
                  }
                }
              }
            }
          }
        `, { issueUrl: issueUrl })
        const { resource } = graphResult

        let allProjects = []
        if (resource.repository.projects) {
          allProjects = allProjects.concat(resource.repository.projects.nodes)
        }

        // Loop through all of the Automation Cards and see if any match
        const automationRules = extractAutomationRules(allProjects).filter(({ ruleName: rn }) => rn === ruleName)

        for (const { column, ruleArgs } of automationRules) {
          if (await ruleMatcher(logger, context, ruleArgs)) {
            logger.info(`Creating Card for "${issueUrl}" to column ${column.id} because of "${ruleName}" and value: "${ruleArgs}"`)
            await context.github.graphql(`
              mutation createCard($contentId: ID!, $columnId: ID!) {
                addProjectCard(input: {contentId: $contentId, projectColumnId: $columnId}) {
                  clientMutationId
                }
              }
            `, { contentId: resource.id, columnId: column.id })
          }
        }
      } else {
        // Check if we need to move the Issue (or Pull request)
        const graphResult = await retryQuery(context, `
          query getCardAndColumnAutomationCards($issueUrl: URI!) {
            resource(url: $issueUrl) {
              ... on Issue {
                projectCards(first: 10) {
                  nodes {
                    id
                    url
                    column {
                      name
                      id
                    }
                    project {
                      ${PROJECT_FRAGMENT}
                    }
                  }
                }
              }
            }
          }
        `, { issueUrl: issueUrl })
        logger.debug(graphResult, 'Retrieved results')
        const { resource } = graphResult
        // sometimes there are no projectCards
        if (!resource.projectCards) {
          logger.error(issueUrl, resource, 'Not even an array for project cards. Odd')
        }
        const cardsForIssue = resource.projectCards ? resource.projectCards.nodes : []

        for (const issueCard of cardsForIssue) {
          const automationRules = extractAutomationRules([issueCard.project]).filter(({ ruleName: rn }) => rn === ruleName)

          for (const { column, ruleArgs } of automationRules) {
            if (await ruleMatcher(logger, context, ruleArgs)) {
              logger.info(`Moving Card ${issueCard.id} for "${issueUrl}" to column ${column.id} because of "${ruleName}" and value: "${ruleArgs}"`)
              await context.github.graphql(`
                mutation moveCard($cardId: ID!, $columnId: ID!) {
                  moveProjectCard(input: {cardId: $cardId, columnId: $columnId}) {
                    clientMutationId
                  }
                }
              `, { cardId: issueCard.id, columnId: column.id })
            }
          }
        }
      }
    })
  })
}
