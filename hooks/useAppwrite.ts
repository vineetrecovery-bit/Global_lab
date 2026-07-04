'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getCertificateByCertId,
  createTestRequest,
  trackTestRequest,
  getCurrentUser,
  Certificate,
  TestRequest,
} from '@/lib/appwrite';

// ========== VERIFY CERTIFICATE HOOK ==========
export function useVerifyCertificate() {
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const verify = useCallback(async (certificateId: string) => {
    if (!certificateId.trim()) {
      setError('Please enter a certificate ID');
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);
    setCertificate(null);

    try {
      const result = await getCertificateByCertId(certificateId.trim().toUpperCase());
      if (!result) {
        setError('No certificate found with this ID. Please check and try again.');
      } else {
        setCertificate(result);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setCertificate(null);
    setError(null);
    setLoading(false);
    setSearched(false);
  }, []);

  return { certificate, loading, error, searched, verify, reset };
}

// ========== SUBMIT TEST REQUEST HOOK ==========
export function useSubmitTestRequest() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (data: Parameters<typeof createTestRequest>[0]) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setRequestId(null);

    try {
      const result = await createTestRequest(data);
      setSuccess(true);
      setRequestId(result.requestId);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setLoading(false);
    setSuccess(false);
    setRequestId(null);
    setError(null);
  }, []);

  return { loading, success, requestId, error, submit, reset };
}

// ========== TRACK REQUEST HOOK ==========
export function useTrackRequest() {
  const [request, setRequest] = useState<TestRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const track = useCallback(async (requestId: string) => {
    if (!requestId.trim()) {
      setError('Please enter a request ID');
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);
    setRequest(null);

    try {
      const result = await trackTestRequest(requestId.trim().toUpperCase());
      if (!result) {
        setError('No request found with this ID. Please check and try again.');
      } else {
        setRequest(result);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setRequest(null);
    setError(null);
    setLoading(false);
    setSearched(false);
  }, []);

  return { request, loading, error, searched, track, reset };
}

// ========== AUTH HOOK ==========
export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, isLoggedIn: !!user };
}