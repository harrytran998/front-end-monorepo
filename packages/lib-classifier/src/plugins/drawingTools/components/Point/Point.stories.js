import { withKnobs } from '@storybook/addon-knobs'
import { storiesOf } from '@storybook/react'
import React, { Component } from 'react'
import { Box } from 'grommet'
import sinon from 'sinon'
import { Provider } from 'mobx-react'
import { Grommet } from 'grommet'
import zooTheme from '@zooniverse/grommet-theme'
import asyncStates from '@zooniverse/async-states'
import cuid from 'cuid'
import SingleImageViewer from '@viewers/components/SingleImageViewer'
import ClassificationStore from '@store/ClassificationStore'
import SubjectViewerStore from '@store/SubjectViewerStore'
import DrawingTask from '@plugins/tasks/DrawingTask/models/DrawingTask'
import { ProjectFactory, SubjectFactory, WorkflowFactory } from '@test/factories'

const subject = SubjectFactory.build({
  locations: [
    { 'image/jpeg': 'http://placekitten.com/500/300' }
  ]
})

const project = ProjectFactory.build()
const workflow = WorkflowFactory.build()
const drawingTaskSnapshot = {
  instruction: 'Draw a point',
  taskKey: 'T1',
  tools: [{
    color: zooTheme.global.colors['drawing-red'],
    type: 'point'
  }],
  type: 'drawing'
}

const subTasksSnapshot = [
  {
    instruction: 'Name your favourite fruit.',
    taskKey: 'T0.0',
    type: 'text'
  },
  {
    answers: [{ label: "yes" }, { label: "no" }],
    help: "",
    question: "Is it tasty?",
    taskKey: 'T0.1',
    type: 'single'
  },
  {
    answers: [{ label: "cat" }, { label: "dog" }, { label: "bird" }],
    help: "",
    question: "Select your favourite animals.",
    taskKey: 'T0.2',
    type: 'multiple'
  }
]

function setupStores ({ activeMark = false, subtask = false }) {
  if (subtask) {
    drawingTaskSnapshot.tools[0].details = subTasksSnapshot
    drawingTaskSnapshot.subTaskVisibility = true
    drawingTaskSnapshot.subTaskMarkBounds = {
      x: 100,
      y: 100,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }
  } 

  const drawingTask = DrawingTask.create(drawingTaskSnapshot)
  drawingTask.setActiveTool(0)
  const point = drawingTask.activeTool.createMark()
  point.move({ x: 100, y: 100 })

  const mockStores = {
    classifications: ClassificationStore.create(),
    subjects: {
      active: subject
    },
    subjectViewer: SubjectViewerStore.create(),
    workflows: {
      active: { id: cuid() }
    },
    workflowSteps: {
      activeStepTasks: [drawingTask]
    }
  }

  mockStores.classifications.createClassification(subject, workflow, project)
  mockStores.workflowSteps.activeStepTasks[0].updateAnnotation()
  if (activeMark) {
    mockStores.workflowSteps.activeStepTasks[0].setActiveMark(point.id)
  }

  if (subtask) {
    mockStores
  }

  return mockStores
}


class DrawingStory extends Component {
  constructor () {
    super()

    this.state = {
      loadingState: asyncStates.initialized
    }
  }

  componentDidMount () {
    // what needs this time to make the svg ref to be defined?
    // 100ms isn't enough time 1000ms is
    setTimeout(() => this.setState({ loadingState: asyncStates.success }), 1000)
  }

  render () {
    return (
      <Provider classifierStore={this.props.stores}>
        <Grommet
          background={{
            dark: 'dark-1',
            light: 'light-1'
          }}
          theme={zooTheme}
          themeMode='light'
        >
          <Box height='medium' width='large'>
            <SingleImageViewer
              loadingState={this.state.loadingState}
              subject={subject}
            />
          </Box>
        </Grommet>
      </Provider>
    )
  }
}
storiesOf('Drawing tools | Point', module)
  .addDecorator(withKnobs)
  .addParameters({
    viewport: {
      defaultViewport: 'responsive'
    }
  })
  .add('complete', function () {
    const stores = setupStores({})
    return (
      <DrawingStory stores={stores} />
    )
  })
  .add('active', function () {
    const stores = setupStores({ activeMark: true })
    return (
      <DrawingStory stores={stores} />
    )
  })
  .add('active with subtask', function () {
    const stores = setupStores({ activeMark: true, subtask: true })
    return (
      <DrawingStory stores={stores} />
    )
  })
