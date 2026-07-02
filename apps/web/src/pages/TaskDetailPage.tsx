import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Spinner } from '@meridian/ui-kit'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { usePermissions } from '../hooks/usePermissions'
import './TaskDetailPage.css'

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const { client } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [commentBody, setCommentBody] = useState('')
  const { isEnabled } = useFeatureFlags()

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => client.getTask(taskId!),
    enabled: !!taskId,
  })

  const { data: project } = useQuery({
    queryKey: ['project', task?.project_id],
    queryFn: () => client.getProject(task!.project_id),
    enabled: !!task?.project_id,
  })

  const { canWrite } = usePermissions(project?.team_id)

  const { data: comments } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => client.listComments(taskId!),
    enabled: !!taskId,
  })

  const { data: attachments } = useQuery({
    queryKey: ['attachments', taskId],
    queryFn: () => client.listAttachments(taskId!),
    enabled: !!taskId && isEnabled('file_attachments'),
  })

  const addComment = useMutation({
    mutationFn: (body: string) => client.createComment(taskId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] })
      setCommentBody('')
    },
  })

  const addAttachment = useMutation({
    mutationFn: () =>
      client.createAttachment(taskId!, {
        filename: 'screenshot.png',
        content_type: 'image/png',
        size_bytes: 102400,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', taskId] })
    },
  })

  const deleteTaskMutation = useMutation({
    mutationFn: () => client.deleteTask(taskId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', task?.project_id] })
      navigate(`/projects/${task?.project_id}`)
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!commentBody.trim()) return
    addComment.mutate(commentBody.trim())
  }

  if (isLoading) return <Spinner />
  if (!task) return <p>Task not found</p>

  return (
    <div className="task-detail">
      <Link to={`/projects/${task.project_id}`} className="back-link">
        &larr; Back to board
      </Link>

      <div className="task-detail-header">
        <h1>{task.title}</h1>
        <Badge variant={task.status}>{task.status.replace('_', ' ')}</Badge>
      </div>

      {canWrite && (
        <div style={{ margin: '1rem 0' }}>
          <Button
            variant="secondary"
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this task? This cannot be undone.')) {
                deleteTaskMutation.mutate()
              }
            }}
            disabled={deleteTaskMutation.isPending}
          >
            {deleteTaskMutation.isPending ? 'Deleting...' : 'Delete Task'}
          </Button>
        </div>
      )}

      {task.description && (
        <p className="task-description">{task.description}</p>
      )}

      {isEnabled('file_attachments') && (
        <section className="attachments-section">
          <h2>Attachments ({attachments?.length ?? 0})</h2>
          {attachments?.map((att) => (
            <Card key={att.id} className="attachment-card">
              <a href={att.s3_url} target="_blank" rel="noreferrer">{att.filename}</a>
              <span className="attachment-meta">
                {(att.size_bytes / 1024).toFixed(1)} KB
              </span>
            </Card>
          ))}
          {canWrite && (
            <Button
              variant="secondary"
              onClick={() => addAttachment.mutate()}
              disabled={addAttachment.isPending}
            >
              {addAttachment.isPending ? 'Uploading...' : 'Add stub attachment'}
            </Button>
          )}
        </section>
      )}

      <section className="comments-section">
        <h2>Comments ({comments?.length ?? 0})</h2>

        {canWrite ? (
          <form className="comment-form" onSubmit={handleSubmit}>
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Add a comment..."
              rows={3}
            />
            <Button type="submit" disabled={addComment.isPending}>
              {addComment.isPending ? 'Posting...' : 'Post comment'}
            </Button>
          </form>
        ) : (
          <p className="viewer-notice">View-only — you cannot add comments.</p>
        )}

        <div className="comment-list">
          {comments?.map((comment) => (
            <Card key={comment.id} className="comment">
              <div className="comment-meta">
                <strong>{comment.author_name}</strong>
                <time>{new Date(comment.created_at).toLocaleString()}</time>
              </div>
              <p>{comment.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}