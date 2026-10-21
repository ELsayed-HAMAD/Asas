import React, { useState } from 'react'
import { GoogleIcon, AppleIcon } from '../common/BrandIcons'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { authApi } from '../../lib/api/auth'
import { Check, ChevronDown, ChevronUp, Info, Loader2, Sparkles, X } from 'lucide-react'

const PRESET_PROFILES = [
  {
    name: 'Hamad Elsayed',
    email: 'hamad@asas-enterprise.io',
    role: 'Founder & CEO',
    provider: 'google',
  },
  {
    name: 'Alex Morgan',
    email: 'alex.morgan@techcorp.io',
    role: 'Finance Director',
    provider: 'google',
  },
  {
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@apple-id.io',
    role: 'Operations Lead',
    provider: 'apple',
  },
]

export default function DevSocialModal({ isOpen, onClose, provider = 'google', onSuccess }) {
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [useCustom, setUseCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customEmail, setCustomEmail] = useState('')
  const [showConfigGuide, setShowConfigGuide] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const relevantPresets = PRESET_PROFILES.filter(p => p.provider === provider)
  const activePreset = relevantPresets[selectedPreset] || relevantPresets[0]

  const handleAuthenticate = async () => {
    setError('')
    setLoading(true)
    try {
      const email = useCustom ? customEmail.trim() : activePreset.email
      const name = useCustom ? customName.trim() : activePreset.name

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Please enter a valid email address.')
        setLoading(false)
        return
      }

      const res = await authApi.devSocialLogin({
        provider,
        email,
        name: name || undefined,
      })

      const data = res?.data || res
      if (data?.success) {
        if (onSuccess) {
          onSuccess(data)
        } else {
          window.location.assign(data.redirectUrl || '/dashboard')
        }
      } else {
        setError('Failed to create developer session.')
      }
    } catch (err) {
      setError(err?.message || 'Failed to authenticate in development mode.')
    } finally {
      setLoading(false)
    }
  }

  const isApple = provider === 'apple'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-social-title"
        className="w-full max-w-md rounded-card border border-border-default bg-surface-raised p-6 shadow-elevated relative animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 p-1 rounded-button text-muted hover:text-heading hover:bg-surface-muted transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        {/* Dialog Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-surface-muted border border-border-default flex items-center justify-center shrink-0">
            {isApple ? <AppleIcon className="w-5 h-5 text-heading" /> : <GoogleIcon className="w-5 h-5" />}
          </div>
          <div>
            <h2 id="dev-social-title" className="text-lg font-bold text-heading flex items-center gap-2">
              <span>{isApple ? 'Apple Sign In' : 'Google Sign In'}</span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-accent-light text-accent">
                Dev Sandbox
              </span>
            </h2>
            <p className="text-xs text-muted">Simulate enterprise single sign-on in local development</p>
          </div>
        </div>

        {/* Informative Callout */}
        <div className="mb-4 p-3 rounded-card-sm bg-warning-light border border-warning-border text-warning-text text-xs leading-relaxed flex items-start gap-2">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>
            Live {isApple ? 'Apple' : 'Google'} OAuth client credentials are not configured in <code className="font-mono font-semibold">apps/api/.env</code>.
            Choose or enter a profile below to authenticate and test the full onboarding and dashboard workflow.
          </span>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-card-sm bg-danger-light border border-danger-border text-danger-text text-xs">
            {error}
          </div>
        )}

        {/* Profile Options */}
        <div className="space-y-2 mb-4">
          <p className="text-xs font-semibold text-heading">Select an enterprise testing profile:</p>

          {relevantPresets.map((profile, idx) => {
            const isSelected = !useCustom && selectedPreset === idx
            return (
              <button
                key={profile.email}
                type="button"
                onClick={() => {
                  setSelectedPreset(idx)
                  setUseCustom(false)
                }}
                className={`w-full text-left p-3 rounded-card-sm border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'border-accent bg-accent-light/30 ring-1 ring-accent'
                    : 'border-border-default bg-surface hover:bg-surface-muted'
                }`}
              >
                <div>
                  <p className="text-xs font-bold text-heading">{profile.name}</p>
                  <p className="text-[11px] text-muted">{profile.email} &middot; <span className="font-medium text-body">{profile.role}</span></p>
                </div>
                {isSelected && <Check size={16} className="text-accent shrink-0" />}
              </button>
            )
          })}

          {/* Custom Profile Option */}
          <button
            type="button"
            onClick={() => setUseCustom(true)}
            className={`w-full text-left p-3 rounded-card-sm border transition-all cursor-pointer flex items-center justify-between ${
              useCustom
                ? 'border-accent bg-accent-light/30 ring-1 ring-accent'
                : 'border-border-default bg-surface hover:bg-surface-muted'
            }`}
          >
            <div>
              <p className="text-xs font-bold text-heading">Custom Test Profile</p>
              <p className="text-[11px] text-muted">Test with any arbitrary corporate email address</p>
            </div>
            {useCustom && <Check size={16} className="text-accent shrink-0" />}
          </button>
        </div>

        {/* Custom Input Fields (Visible when Custom is Selected) */}
        {useCustom && (
          <div className="space-y-3 mb-4 p-3 rounded-card-sm bg-surface-muted border border-border-default">
            <div>
              <label htmlFor="dev-name" className="block text-[11px] font-semibold text-body mb-1">
                Full Name
              </label>
              <Input
                id="dev-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Dana Vance"
                className="h-8 text-xs bg-surface-raised"
              />
            </div>
            <div>
              <label htmlFor="dev-email" className="block text-[11px] font-semibold text-body mb-1">
                Work Email Address
              </label>
              <Input
                id="dev-email"
                type="email"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="e.g. dana@enterprise.corp"
                className="h-8 text-xs bg-surface-raised"
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="button"
          onClick={handleAuthenticate}
          disabled={loading}
          className="w-full h-10 gap-2 text-xs font-semibold cursor-pointer"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Sparkles size={15} />
          )}
          <span>
            Sign in as {useCustom ? (customName || customEmail || 'Custom User') : activePreset.name}
          </span>
        </Button>

        {/* Production Setup Accordion */}
        <div className="mt-4 pt-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setShowConfigGuide(!showConfigGuide)}
            className="w-full flex items-center justify-between text-left text-[11px] font-medium text-accent hover:underline cursor-pointer"
          >
            <span>How to connect live {isApple ? 'Apple' : 'Google'} credentials for production</span>
            {showConfigGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showConfigGuide && (
            <div className="mt-2 p-3 rounded-card-sm bg-terminal text-terminal-text text-[11px] font-mono leading-relaxed space-y-2">
              <p className="text-terminal-muted"># In apps/api/.env, add:</p>
              {isApple ? (
                <>
                  <p className="text-terminal-success">APPLE_CLIENT_ID="com.yourcompany.service"</p>
                  <p className="text-terminal-success">APPLE_CLIENT_SECRET="your-private-key-jwt"</p>
                  <p className="text-terminal-muted mt-2"># Authorized Redirect URI:</p>
                  <p>http://localhost:4000/api/auth/callback/apple</p>
                </>
              ) : (
                <>
                  <p className="text-terminal-success">GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"</p>
                  <p className="text-terminal-success">GOOGLE_CLIENT_SECRET="GOCSPX-your-secret"</p>
                  <p className="text-terminal-muted mt-2"># Authorized Redirect URI:</p>
                  <p>http://localhost:4000/api/auth/callback/google</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
