import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { CustomProviderModal } from './CustomProviderModal';
import { useModelPreferences } from '../hooks/useModelPreferences';
import { streamCustomWorkflow } from '../hooks/workflow-stream';
import type { ReceivedTraceEvent } from '../hooks/useWorkspace';
import { traceErrorMessage, type TraceEvent } from '../registry/utils';
import type { CapturedSource } from '../registry/renderers';
import type { TimelineEntry } from './TracePane';
import {
  cloneSeedWorkflow,
  customWorkflowToGraph,
  CUSTOM_WORKFLOW_STORAGE_KEY,
  type CustomWorkflowDefinition,
  type CustomWorkflowNode,
} from '../registry/custom-workflow';
import {
  applyWorkflowConnection,
  buildWorkflowGraphEdges,
  CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY,
  defaultWorkflowLayout,
  normalizeWorkflowLayout,
  validateWorkflowClient,
  type WorkflowLayout,
} from '../registry/custom-workflow-flow';
import { traceEventToTimelineEntry } from './Workspace';
import {
  BuilderConsole,
  NodeInspector,
  NodePalette,
  WorkflowFlowNode,
  type BuilderFlowNode,
  type BuilderTab,
  type InspectorTab,
  type PalettePreset,
} from './WorkflowBuilderPanels';
import { providerDisplayLabel, WorkflowBuilderHeader } from './WorkflowBuilderHeader';
import {
  type BuilderNodeData,
  firstConfigurableNodeId,
  initialBuilderNotice,
  insertBeforeOutput,
  loadInitialLayout,
  loadInitialWorkflow,
  MAX_NODES,
  nodeFromPalettePreset,
  nodeSubtitle,
  parseWorkflowJson,
  readBrowserStorage,
  removeBrowserStorage,
  uniqueNodeId,
  writeBrowserStorage,
  removeNode,
  type NodeStatus,
} from './workflow-builder-model';

const nodeTypes = { builderNode: WorkflowFlowNode };

export function WorkflowBuilder() {
  const initialWorkflowRef = useRef<CustomWorkflowDefinition | null>(null);
  if (!initialWorkflowRef.current) initialWorkflowRef.current = loadInitialWorkflow();

  const [workflow, setWorkflow] = useState<CustomWorkflowDefinition>(initialWorkflowRef.current);
  const [layout, setLayout] = useState<WorkflowLayout>(() => loadInitialLayout(initialWorkflowRef.current!));
  const [selectedId, setSelectedId] = useState(firstConfigurableNodeId(initialWorkflowRef.current));
  const [paletteQuery, setPaletteQuery] = useState('');
  const [prompt, setPrompt] = useState('Summarize why visual workflow builders help people learn agents.');
  const [importText, setImportText] = useState('');
  const [builderNotice, setBuilderNotice] = useState(initialBuilderNotice);
  const [activeTab, setActiveTab] = useState<BuilderTab>('result');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('config');
  const [output, setOutput] = useState<unknown>(null);
  const [sources, setSources] = useState<CapturedSource[]>([]);
  const [totalMs, setTotalMs] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [completedNodes, setCompletedNodes] = useState<string[]>([]);
  const [activeNode, setActiveNode] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [traceEvents, setTraceEvents] = useState<ReceivedTraceEvent[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const runStartRef = useRef(0);
  const traceEventIdRef = useRef(0);
  const preferences = useModelPreferences();

  const selectedNode = workflow.nodes.find((node) => node.id === selectedId);
  const graph = useMemo(() => customWorkflowToGraph(workflow), [workflow]);
  const timeline: TimelineEntry[] = useMemo(
    () =>
      traceEvents.map((event, index) =>
        traceEventToTimelineEntry(event, running && index === traceEvents.length - 1),
      ),
    [running, traceEvents],
  );
  const exportedJson = useMemo(() => JSON.stringify(workflow, null, 2), [workflow]);
  const executableNodes = workflow.nodes.filter(
    (node) => node.type !== 'input' && node.type !== 'output',
  ).length;
  const validationIssues = useMemo(() => validateWorkflowClient(workflow), [workflow]);
  const normalizedLayout = useMemo(() => normalizeWorkflowLayout(workflow, layout), [layout, workflow]);

  const flowNodes: BuilderFlowNode[] = useMemo(
    () =>
      workflow.nodes.map((node) => {
        const status: NodeStatus =
          activeNode === node.id
            ? 'active'
            : completedNodes.includes(node.id)
              ? 'done'
              : error
                ? 'error'
                : 'idle';
        return {
          id: node.id,
          type: 'builderNode',
          position: normalizedLayout[node.id] ?? { x: 80, y: 110 },
          selected: selectedId === node.id,
          data: {
            workflowNode: node,
            subtitle: nodeSubtitle(node),
            status,
            issue: validationIssues.find((issue) => issue.includes(node.id) || issue.includes(node.label)),
          },
        };
      }),
    [activeNode, completedNodes, error, normalizedLayout, selectedId, validationIssues, workflow.nodes],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      buildWorkflowGraphEdges(workflow).map((edge) => {
        const active = activeNode === edge.from || activeNode === edge.to;
        const done = completedNodes.includes(edge.from) && completedNodes.includes(edge.to);
        return {
          id: `${edge.from}-${edge.to}-${edge.label ?? 'edge'}`,
          source: edge.from,
          target: edge.to,
          label: edge.label,
          type: 'smoothstep',
          animated: active,
          className: `${edge.className ?? ''} ${done ? 'builder-flow-edge-done' : ''}`.trim(),
          markerEnd: { type: MarkerType.ArrowClosed },
        };
      }),
    [activeNode, completedNodes, workflow],
  );

  const disposeStream = useCallback((request: AbortController) => {
    request.abort();
    if (requestRef.current === request) requestRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (requestRef.current) disposeStream(requestRef.current);
    };
  }, [disposeStream]);

  useEffect(() => {
    if (!workflow.nodes.some((node) => node.id === selectedId)) {
      setSelectedId(firstConfigurableNodeId(workflow));
    }
  }, [selectedId, workflow]);

  useEffect(() => {
    setLayout((current) => normalizeWorkflowLayout(workflow, current));
  }, [workflow]);

  useEffect(() => {
    writeBrowserStorage(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY, JSON.stringify(normalizedLayout));
  }, [normalizedLayout]);

  useEffect(() => {
    window.__mpg = { run: () => runWorkflow() };
    return () => {
      if (window.__mpg?.run) delete window.__mpg.run;
    };
  });

  const updateNode = (node: CustomWorkflowNode) => {
    setWorkflow((current) => ({
      ...current,
      nodes: current.nodes.map((candidate) => (candidate.id === node.id ? node : candidate)),
    }));
  };

  const addNode = (preset: PalettePreset) => {
    if (workflow.nodes.length >= MAX_NODES) return;
    const output = workflow.nodes.find((node) => node.type === 'output');
    const id = uniqueNodeId(workflow.nodes, preset.type);
    const node = nodeFromPalettePreset(preset, workflow, id, output?.id ?? 'output');

    const next = insertBeforeOutput(workflow, node);
    setWorkflow(next);
    setLayout((current) => ({
      ...normalizeWorkflowLayout(next, current),
      [id]: defaultWorkflowLayout(next)[id] ?? { x: 560, y: 180 },
    }));
    setSelectedId(id);
    setInspectorTab('config');
    setBuilderNotice(`${node.label} added before Output`);
  };

  const resetWorkflow = () => {
    const seed = cloneSeedWorkflow();
    setWorkflow(seed);
    setLayout(defaultWorkflowLayout(seed));
    setSelectedId('draft');
    setOutput(null);
    setSources([]);
    setError(null);
    setBuilderNotice('Starter workflow restored');
  };

  const saveWorkflow = () => {
    const savedWorkflow = writeBrowserStorage(CUSTOM_WORKFLOW_STORAGE_KEY, JSON.stringify(workflow));
    const savedLayout = writeBrowserStorage(
      CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY,
      JSON.stringify(normalizedLayout),
    );
    setBuilderNotice(savedWorkflow && savedLayout ? 'Draft saved in this browser' : 'Save failed');
  };

  const loadSavedWorkflow = () => {
    const saved = readBrowserStorage(CUSTOM_WORKFLOW_STORAGE_KEY);
    if (!saved) {
      setBuilderNotice('No saved draft found');
      return;
    }
    try {
      const parsed = parseWorkflowJson(saved);
      setWorkflow(parsed);
      setLayout(loadInitialLayout(parsed));
      setSelectedId(firstConfigurableNodeId(parsed));
      setBuilderNotice('Saved draft loaded');
    } catch {
      removeBrowserStorage(CUSTOM_WORKFLOW_STORAGE_KEY);
      setBuilderNotice('Saved draft was invalid and has been cleared');
    }
  };

  const importWorkflow = () => {
    let parsed: CustomWorkflowDefinition;
    try {
      parsed = parseWorkflowJson(importText);
    } catch {
      setBuilderNotice('Import failed: JSON could not be parsed');
      return;
    }

    const nextLayout = defaultWorkflowLayout(parsed);
    setWorkflow(parsed);
    setLayout(nextLayout);
    setSelectedId(firstConfigurableNodeId(parsed));
    const savedWorkflow = writeBrowserStorage(CUSTOM_WORKFLOW_STORAGE_KEY, JSON.stringify(parsed));
    const savedLayout = writeBrowserStorage(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY, JSON.stringify(nextLayout));
    setImportText('');
    setBuilderNotice(
      savedWorkflow && savedLayout
        ? 'Workflow JSON imported and saved'
        : 'Workflow JSON imported, but browser save failed',
    );
  };

  const handleEvent = useCallback((event: TraceEvent) => {
    const stepId = 'stepId' in event ? event.stepId : undefined;
    const elapsed = runStartRef.current ? performance.now() - runStartRef.current : 0;
    switch (event.type) {
      case 'step:start':
        if (stepId) setActiveNode(stepId);
        break;
      case 'step:end':
        if (stepId) {
          setActiveNode('idle');
          setDoneCount((count) => count + 1);
          setCompletedNodes((nodes) => (nodes.includes(stepId) ? nodes : [...nodes, stepId]));
        }
        break;
      case 'tool:call':
        setSources((previous) => [
          ...previous,
          { tool: event.tool, input: event.input, output: event.output },
        ]);
        break;
      case 'llm:start':
        if (stepId) setActiveNode(stepId);
        break;
      case 'llm:end':
        setActiveNode('idle');
        break;
      case 'done':
        setTotalMs(event.totalMs || elapsed);
        setActiveNode('idle');
        if (event.status === 'success') {
          setOutput(event.output);
          setBuilderNotice('Run completed');
        } else {
          setOutput(event.output);
          setError(traceErrorMessage(event.output, 'Workflow failed'));
          setBuilderNotice('Run failed');
        }
        break;
      default:
        break;
    }
  }, []);

  const runWorkflow = useCallback(() => {
    if (requestRef.current) disposeStream(requestRef.current);
    setOutput(null);
    setSources([]);
    setTotalMs(0);
    setDoneCount(0);
    setCompletedNodes([]);
    setActiveNode('idle');
    setError(null);
    setActiveTab('result');
    setRunning(true);
    setBuilderNotice('Running custom workflow');
    setTraceEvents([]);
    traceEventIdRef.current = 0;
    runStartRef.current = performance.now();

    const request = new AbortController();
    requestRef.current = request;
    const requestBody = preferences.addToRequest({ workflow, input: { prompt } });

    const receive = (event: TraceEvent) => {
      if (requestRef.current !== request) return;
      const ts = runStartRef.current ? performance.now() - runStartRef.current : 0;
      const id = String(++traceEventIdRef.current);
      setTraceEvents((previous) => [...previous, { id, ts, event }]);
      handleEvent(event);
      if (event.type === 'done') {
        requestRef.current = null;
        setRunning(false);
      }
    };

    void (async () => {
      try {
        await streamCustomWorkflow({ requestBody, signal: request.signal, onEvent: receive });
      } catch (err) {
        if (request.signal.aborted || requestRef.current !== request) return;
        requestRef.current = null;
        setError(err instanceof Error ? err.message : String(err));
        setBuilderNotice('Run failed');
        setActiveNode('idle');
        setRunning(false);
      }
    })();
  }, [disposeStream, handleEvent, preferences, prompt, workflow]);

  const onNodesChange = useCallback((changes: NodeChange<BuilderFlowNode>[]) => {
    const positionChanges = changes.filter(
      (change): change is Extract<NodeChange<BuilderFlowNode>, { type: 'position' }> =>
        change.type === 'position' && Boolean(change.position) && change.dragging === true,
    );
    if (positionChanges.length === 0) return;
    setLayout((current) => {
      const next = { ...current };
      for (const change of positionChanges) {
        if (change.position) next[change.id] = change.position;
      }
      return next;
    });
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const next = applyWorkflowConnection(workflow, connection);
      setWorkflow(next);
      setBuilderNotice(
        next === workflow ? 'Branch routes are edited in the inspector' : 'Connection updated',
      );
    },
    [workflow],
  );

  const providerLabel = providerDisplayLabel(preferences.provider);
  const isCustomProvider = preferences.provider === 'custom';
  const isValid = validationIssues.length === 0;

  return (
    <article
      className="workspace workspace-active workflow-builder"
      id="mp-workspace"
      data-example="prim-tag-workflow"
    >
      <WorkflowBuilderHeader
        workflowName={workflow.name}
        isValid={isValid}
        issueCount={validationIssues.length}
        running={running}
        nodeCount={workflow.nodes.length}
        maxNodes={MAX_NODES}
        executableNodes={executableNodes}
        notice={builderNotice}
        provider={preferences.provider}
        model={preferences.model}
        modelOptions={preferences.modelOptions}
        isCustomProvider={isCustomProvider}
        providerApiKey={preferences.providerApiKey}
        customModel={preferences.customModel}
        onProviderChange={preferences.selectProvider}
        onModelChange={preferences.setModel}
        onOpenSettings={() => setShowCustomModal(true)}
      />

      <div className="builder-shell">
        <NodePalette
          query={paletteQuery}
          setQuery={setPaletteQuery}
          onAdd={addNode}
          onSave={saveWorkflow}
          onLoad={loadSavedWorkflow}
          onReset={resetWorkflow}
          onOpenJson={() => setActiveTab('json')}
          disabled={workflow.nodes.length >= MAX_NODES}
        />

        <section className="builder-canvas-shell" aria-label="Workflow canvas">
          {!isValid ? (
            <div className="builder-validation-banner">
              {validationIssues.slice(0, 2).map((issue) => (
                <span key={issue}>{issue}</span>
              ))}
            </div>
          ) : null}
          <ReactFlowProvider>
            <ReactFlow
              className="builder-flow"
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeClick={(_event, node) => setSelectedId(node.id)}
              onConnect={onConnect}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.35}
              maxZoom={1.4}
            >
              <Background color="rgba(148, 163, 184, 0.28)" gap={22} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                className="builder-minimap"
                pannable
                zoomable
                nodeStrokeWidth={3}
                nodeColor={(node) => {
                  const data = node.data as BuilderNodeData | undefined;
                  const type = data?.workflowNode.type;
                  if (type === 'llm') return '#19d3c5';
                  if (type === 'tool') return '#3b82f6';
                  if (type === 'branch') return '#f59e0b';
                  if (type === 'output') return '#8b5cf6';
                  return '#10b981';
                }}
              />
            </ReactFlow>
          </ReactFlowProvider>
        </section>

        <NodeInspector
          node={selectedNode}
          nodes={workflow.nodes}
          activeTab={inspectorTab}
          setActiveTab={setInspectorTab}
          workflowName={workflow.name}
          onWorkflowNameChange={(name) => setWorkflow((current) => ({ ...current, name }))}
          onUpdate={updateNode}
          onDelete={() => {
            const next = removeNode(workflow, selectedId);
            setWorkflow(next);
            setSelectedId('output');
            setBuilderNotice('Node deleted');
          }}
        />
      </div>

      <BuilderConsole
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        prompt={prompt}
        setPrompt={setPrompt}
        placeholder={workflow.input.placeholder}
        running={running}
        runWorkflow={runWorkflow}
        output={output}
        sources={sources}
        error={error}
        graph={graph}
        timeline={timeline}
        doneCount={doneCount}
        completedNodes={completedNodes}
        activeNode={activeNode}
        totalMs={totalMs}
        importText={importText}
        setImportText={setImportText}
        importWorkflow={importWorkflow}
        exportedJson={exportedJson}
      />

      {showCustomModal ? (
        <CustomProviderModal
          title={isCustomProvider ? 'Custom endpoint' : `${providerLabel} settings`}
          showBaseUrl={isCustomProvider}
          baseUrl={preferences.customBaseUrl}
          apiKey={isCustomProvider ? preferences.customApiKey : preferences.providerApiKey}
          model={isCustomProvider ? preferences.customModel : preferences.providerCustomModel}
          apiKeyPlaceholder={
            isCustomProvider ? 'sk-...' : preferences.provider === 'google' ? 'AIza...' : 'sk-or-...'
          }
          modelPlaceholder={
            isCustomProvider
              ? 'gpt-4o-mini'
              : preferences.provider === 'google'
                ? 'gemini-2.5-flash'
                : 'openai/gpt-oss-20b:free'
          }
          onBaseUrlChange={preferences.setCustomBaseUrl}
          onApiKeyChange={isCustomProvider ? preferences.setCustomApiKey : preferences.setProviderApiKey}
          onModelChange={isCustomProvider ? preferences.setCustomModel : preferences.setProviderCustomModel}
          onClear={preferences.clearCurrentProviderSettings}
          onClose={() => setShowCustomModal(false)}
        />
      ) : null}
    </article>
  );
}
