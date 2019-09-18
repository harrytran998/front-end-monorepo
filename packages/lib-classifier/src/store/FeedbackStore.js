import { autorun } from 'mobx'
import { addDisposer, addMiddleware, getRoot, isValidReference, onAction, types } from 'mobx-state-tree'
import { flatten } from 'lodash'

import helpers from './feedback/helpers'
import strategies from './feedback/strategies'

const FeedbackStore = types
  .model('FeedbackStore', {
    rules: types.map(types.frozen({})),
    showModal: types.optional(types.boolean, false)
  })
  .volatile(self => ({
    onHide: () => true
  }))
  .views(self => ({
    get applicableRules () {
      return flatten(Array.from(self.rules.values()))
        .filter(rule => (rule.success && rule.successEnabled) || (!rule.success && rule.failureEnabled))
    },
    get hideSubjectViewer () {
      return flatten(Array.from(self.rules.values()))
        .some(rule => rule.hideSubjectViewer)
    },
    get isActive () {
      const { projects = {}, subjects = {}, workflows = {} } = getRoot(self)
      const validProject = isValidReference(() => projects.active) && projects.active
      const validWorkflow = isValidReference(() => workflows.active) && workflows.active
      const validSubject = isValidReference(() => subjects.active) && subjects.active
      return helpers.isFeedbackActive(validProject, validSubject, validWorkflow)
    },
    // This is a workaround for https://github.com/zooniverse/front-end-monorepo/issues/1112
    // (feedback incorrectly being active when there are no rules)
    get isValid () {
      return self.isActive && self.rules && self.rules.size > 0
    },
    get messages () {
      return self.applicableRules
        .map(rule => rule.success ? rule.successMessage : rule.failureMessage)
    }
  }))
  .actions(self => {
    function setOnHide (onHide) {
      self.onHide = onHide
    }

    function afterAttach () {
      createClassificationObserver()
      createSubjectMiddleware()
      createSubjectObserver()
    }

    function createClassificationObserver () {
      const classificationDisposer = autorun(() => {
        onAction(getRoot(self).classifications, (call) => {
          if (call.name === 'completeClassification') {
            const annotations = getRoot(self).classifications.currentAnnotations
            annotations.forEach(annotation => self.update(annotation))
          }
        })
      }, { name: 'FeedbackStore Classification Observer autorun' })
      addDisposer(self, classificationDisposer)
    }

    function onNewSubject () {
      const validSubjectReference = isValidReference(() => getRoot(self).subjects.active)
      if (validSubjectReference) {
        const subject = getRoot(self).subjects.active
        self.reset()
        self.createRules(subject)
      }
    }

    function onSubjectAdvance (call, next, abort) {
      const shouldShowFeedback = self.isActive && self.messages.length && !self.showModal
      if (shouldShowFeedback) {
        if (process.browser) {
          console.log('Aborting subject advance and showing feedback')
        }
        abort()
        self.showFeedback()
      } else {
        next(call)
      }
    }

    function createSubjectMiddleware () {
      const subjectMiddleware = autorun(() => {
        addMiddleware(getRoot(self).subjects, (call, next, abort) => {
          if (call.name === 'advance') {
            onSubjectAdvance(call, next, abort)
          } else {
            next(call)
          }
        })
      }, { name: 'FeedbackStore Subject Middleware autorun' })
      addDisposer(self, subjectMiddleware)
    }

    function createSubjectObserver () {
      const subjectDisposer = autorun(onNewSubject, { name: 'FeedbackStore Subject Observer autorun' })
      addDisposer(self, subjectDisposer)
    }

    function createRules (subject) {
      const validWorkflowReference = isValidReference(() => getRoot(self).workflows.active)

      if (validWorkflowReference && subject) {
        const workflow = getRoot(self).workflows.active

        if (self.isActive) {
          self.rules = helpers.generateRules(subject, workflow)
        }
      } else {
        if (process.browser) {
          console.error('Cannot create feedback rules without project, workflow, and/or subject')
        }
      }
    }

    function showFeedback () {
      self.showModal = true
    }

    function hideFeedback () {
      self.onHide()
      self.showModal = false
    }

    function update (annotation) {
      if (self.isValid) {
        const { task, value } = annotation
        const taskRules = self.rules.get(task) || []
        const updatedTaskRules = taskRules.map(rule => {
          const ruleReducer = strategies[rule.strategy].reducer
          return ruleReducer(rule, value)
        })
        self.rules.set(task, updatedTaskRules)
      }
    }

    function reset () {
      self.rules.clear()
      self.showModal = false
      const onHide = getRoot(self).subjects.advance
      self.setOnHide(onHide)
    }

    return {
      afterAttach,
      createRules,
      setOnHide,
      showFeedback,
      hideFeedback,
      onNewSubject,
      onSubjectAdvance,
      update,
      reset
    }
  })

export default FeedbackStore
