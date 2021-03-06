import { autorun } from 'mobx'
import { addDisposer, getRoot, isValidReference, tryReference, types, flow } from 'mobx-state-tree'
import asyncStates from '@zooniverse/async-states'
import ResourceStore from './ResourceStore'
import Tutorial from './Tutorial'
import Medium from './Medium'

const TutorialStore = types
  .model('TutorialStore', {
    active: types.safeReference(Tutorial),
    activeMedium: types.safeReference(Medium),
    activeStep: types.optional(types.integer, -1),
    attachedMedia: types.map(Medium),
    resources: types.map(Tutorial),
    tutorialSeenTime: types.maybe(types.string),
    showModal: types.optional(types.boolean, false),
    type: types.optional(types.string, 'tutorials')
  })

  .views(self => ({
    get isActiveReferenceValid () {
      return isValidReference(() => self.active)
    },

    get isActiveStepValid () {
      return self.isActiveReferenceValid && self.activeStep > -1
    },

    get disableTutorialTab () {
      return self.loadingState !== asyncStates.success || (self.loadingState === asyncStates.success && !self.tutorial)
    },

    get stepWithMedium () {
      if (self.isActiveStepValid) {
        const step = self.active.steps[self.activeStep]
        return { step, medium: self.activeMedium }
      }
      return null
    },

    get tutorial () {
      const tutorials = Array.from(self.resources.values())
      // For backwards compatibility, we assume tutorials with a null kind are standard tutorials
      if (tutorials) {
        return tutorials.find((tutorial) => {
          return tutorial.kind === 'tutorial' || tutorial.kind === null
        })
      }

      return null
    },

    get miniCourse () {
      const tutorials = Array.from(self.resources.values())

      if (tutorials) {
        return tutorials.find((tutorial) => {
          return tutorial.kind === 'mini-course'
        })
      }

      return null
    },

    get hasNotSeenTutorialBefore () {
      const upp = tryReference(() => getRoot(self).userProjectPreferences.active)
      const { tutorial } = self
      if (upp && tutorial) {
        return !(upp.preferences.tutorials_completed_at && upp.preferences.tutorials_completed_at[tutorial.id])
      }

      return true
    },

    get tutorialLastSeen () {
      const upp = tryReference(() => getRoot(self).userProjectPreferences.active)
      const { tutorial } = self
      if (upp && upp.preferences.tutorials_completed_at && tutorial) {
        return upp.preferences.tutorials_completed_at[tutorial.id]
      }

      return null
    },

    isMiniCourseCompleted (lastStepSeen) {
      const { miniCourse } = self

      if (miniCourse) return lastStepSeen === miniCourse.steps.length - 1

      return false
    },

    get isFirstStep () {
      if (self.isActiveStepValid) {
        return self.activeStep === 0
      }

      return false
    },

    get isLastStep () {
      if (self.isActiveStepValid) {
        const numOfSteps = self.active.steps.length
        return self.activeStep === numOfSteps - 1
      }

      return false
    }
  }))

  .actions(self => {
    function afterAttach () {
      createWorkflowObserver()
      createUPPObserver()
    }

    function createWorkflowObserver () {
      const workflowDisposer = autorun(() => {
        const workflow = tryReference(() => getRoot(self).workflows.active)
        if (workflow) {
          self.reset()
          self.resetSeen()
          self.fetchTutorials()
        }
      }, { name: 'Tutorial Store Workflow Observer autorun' })
      addDisposer(self, workflowDisposer)
    }

    function createUPPObserver () {
      const uppDisposer = autorun(() => {
        const upp = getRoot(self).userProjectPreferences
        if (upp.loadingState === asyncStates.success) {
          self.showTutorialInModal()
        }
      }, { name: 'Tutorial Store UPP Observer autorun' })
      addDisposer(self, uppDisposer)
    }

    const fetchMedia = flow(function * fetchMedia (tutorial) {
      const { tutorials } = getRoot(self).client
      if (tutorial) {
        self.loadingState = asyncStates.loading
        try {
          const response = yield tutorials.getAttachedImages({ id: tutorial.id })
          const { media } = response.body
          if (media && media.length > 0) self.setMediaResources(media)
        } catch (error) {
          // We're not setting the store state to error because
          // we do not want to prevent the tutorial from rendering
          console.error(error)
        }
      }
    })

    function setMediaResources (media) {
      media.forEach(medium => self.attachedMedia.put(medium))
    }

    // This could use a refactor after Panoptes bug with using include to get attached images is fixed
    // See comments in the commonRequests.js file for tutorials in panoptes.js
    function * fetchTutorials () {
      const workflow = getRoot(self).workflows.active
      const tutorialsClient = getRoot(self).client.tutorials
      const upp = getRoot(self).userProjectPreferences

      self.loadingState = asyncStates.loading
      try {
        const response = yield tutorialsClient.get({ workflowId: workflow.id })
        const { tutorials } = response.body
        if (tutorials && tutorials.length > 0) {
          const mediaRequests = tutorials.map(fetchMedia)
          yield Promise.all(mediaRequests)
          self.setTutorials(tutorials)
          self.loadingState = asyncStates.success
          if (upp.loadingState === asyncStates.success) {
            self.showTutorialInModal()
          }
        } else {
          self.loadingState = asyncStates.success
        }
      } catch (error) {
        console.error(error)
        self.loadingState = asyncStates.error
      }
    }

    function setTutorials (tutorials) {
      tutorials.forEach(tutorial => self.resources.put(tutorial))
    }

    function setTutorialStep (stepIndex = 0) {
      if (self.isActiveReferenceValid) {
        const { steps } = self.active
        self.activeMedium = undefined
        if (stepIndex < steps.length) {
          self.activeStep = stepIndex
          if (steps[stepIndex].media) self.activeMedium = steps[stepIndex].media
        }
      }
    }

    function setActiveTutorial (id, stepIndex) {
      if (!id) {
        self.resetActiveTutorial()
      } else {
        self.active = id
        self.setTutorialStep(stepIndex)
        self.setSeenTime()
      }
    }

    function setSeenTime () {
      const uppStore = getRoot(self).userProjectPreferences
      const validUPP = isValidReference(() => uppStore.active)

      const seen = new Date().toISOString()
      if (self.isActiveReferenceValid) {
        const tutorial = self.active
        if (tutorial.kind === 'tutorial' || tutorial.kind === null) {
          self.tutorialSeenTime = seen
          if (validUPP) {
            const changes = {
              preferences: {
                tutorials_completed_at: {
                  [tutorial.id]: seen
                }
              }
            }
            uppStore.updateUPP(changes)
          }
        }
      }
    }

    function resetActiveTutorial () {
      // we manually set active and activeMedium to undefined
      // because we are not removing the tutorial from the map
      self.active = undefined
      self.activeStep = -1
      self.activeMedium = undefined
    }

    function resetSeen () {
      self.tutorialSeenTime = undefined
    }

    function setModalVisibility (boolean) {
      self.showModal = boolean
    }

    function showTutorialInModal () {
      const { tutorial } = self
      if (tutorial && self.hasNotSeenTutorialBefore) {
        self.setActiveTutorial(tutorial.id)
        self.setModalVisibility(true)
      }
    }

    return {
      afterAttach,
      fetchTutorials: flow(fetchTutorials),
      resetActiveTutorial,
      resetSeen,
      setActiveTutorial,
      setMediaResources,
      setSeenTime,
      setTutorialStep,
      setTutorials,
      setModalVisibility,
      showTutorialInModal
    }
  })

export default types.compose('TutorialResourceStore', ResourceStore, TutorialStore)
