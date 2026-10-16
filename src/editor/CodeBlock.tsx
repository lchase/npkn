import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)
const languages = lowlight.listLanguages().sort()

function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper className="codeblock">
      <select
        contentEditable={false}
        value={node.attrs.language ?? ''}
        onChange={e => updateAttributes({ language: e.target.value || null })}
      >
        <option value="">auto</option>
        {languages.map(l => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  )
}

/**
 * Highlighted code block. New blocks are plain text; pick a language, or "auto" (null) to guess.
 * Token colors come from --syn-* theme vars (see styles.css).
 */
export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({ lowlight, defaultLanguage: 'plaintext' })
