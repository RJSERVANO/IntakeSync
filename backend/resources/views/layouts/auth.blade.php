<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('title', 'IntakeSync Admin')</title>

    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        aqua: '#1E3A8A',
                        'aqua-light': '#3B82F6'
                    }
                }
            }
        }
    </script>
    <script src="https://cdn.tailwindcss.com"></script>

    <style>
        html, body {
            min-height: 100%;
        }

        body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        @keyframes wave1 {
            0%, 100% {
                d: path("M0,100 Q250,50 500,100 T1000,100 L1000,0 L0,0 Z");
            }

            50% {
                d: path("M0,120 Q250,40 500,120 T1000,120 L1000,0 L0,0 Z");
            }
        }

        @keyframes wave2 {
            0%, 100% {
                d: path("M0,130 Q250,80 500,130 T1000,130 L1000,0 L0,0 Z");
            }

            50% {
                d: path("M0,110 Q250,60 500,110 T1000,110 L1000,0 L0,0 Z");
            }
        }

        @keyframes wave3 {
            0%, 100% {
                d: path("M0,150 Q250,100 500,150 T1000,150 L1000,0 L0,0 Z");
            }

            50% {
                d: path("M0,130 Q250,80 500,130 T1000,130 L1000,0 L0,0 Z");
            }
        }

        @keyframes float {
            0%, 100% {
                transform: translateY(0);
            }

            50% {
                transform: translateY(-20px);
            }
        }

        .auth-shell {
            min-height: 100vh;
            min-height: 100dvh;
            position: relative;
            overflow-x: hidden;
            overflow-y: auto;
            background: linear-gradient(to bottom, #1d4ed8, #1e40af, #172554);
        }

        .wave-container {
            position: fixed;
            inset-inline: 0;
            bottom: 0;
            height: 300px;
            overflow: hidden;
            pointer-events: none;
        }

        .wave svg {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: auto;
        }

        .wave-1 path {
            animation: wave1 8s linear infinite;
            fill: rgba(30, 58, 138, 0.6);
            opacity: 0.8;
        }

        .wave-2 path {
            animation: wave2 10s linear infinite;
            fill: rgba(25, 45, 109, 0.5);
            opacity: 0.6;
        }

        .wave-3 path {
            animation: wave3 12s linear infinite;
            fill: rgba(20, 35, 80, 0.4);
            opacity: 0.4;
        }

        .floating-shape {
            position: fixed;
            border-radius: 9999px;
            animation: float 4s ease-in-out infinite;
            opacity: 0.25;
            pointer-events: none;
        }

        .shape-1 {
            width: 120px;
            height: 120px;
            background: rgba(99, 102, 241, 0.25);
            top: 20%;
            left: 10%;
            animation-delay: 0s;
        }

        .shape-2 {
            width: 80px;
            height: 80px;
            background: rgba(59, 130, 246, 0.2);
            top: 15%;
            right: 15%;
            animation-delay: 1s;
        }

        .shape-3 {
            width: 100px;
            height: 100px;
            background: rgba(37, 99, 235, 0.15);
            top: 50%;
            left: 5%;
            animation-delay: 2s;
        }

        .shape-4 {
            width: 90px;
            height: 90px;
            background: rgba(29, 78, 216, 0.2);
            bottom: 150px;
            right: 10%;
            animation-delay: 1.5s;
        }

        .auth-card {
            background: rgba(15, 23, 42, 0.92);
            border: 1px solid rgba(148, 163, 184, 0.24);
            box-shadow:
                0 24px 70px rgba(2, 6, 23, 0.42),
                inset 0 1px 0 rgba(255, 255, 255, 0.06);
            backdrop-filter: blur(16px);
            max-width: 24rem;
        }

        .auth-logo {
            height: 5.5rem;
            width: auto;
            object-fit: contain;
        }

        .admin-field-icon {
            position: absolute;
            left: 1rem;
            top: 50%;
            transform: translateY(-50%);
            display: flex;
            height: 1.25rem;
            width: 1.25rem;
            align-items: center;
            justify-content: center;
            pointer-events: none;
        }

        .admin-field-input {
            min-height: 3.35rem;
            padding-left: 3.35rem !important;
            padding-right: 1rem !important;
            width: 100%;
            border: 1px solid #cbd5e1;
            border-radius: 0.75rem;
            background: #ffffff;
            color: #0f172a;
            font-size: 0.875rem;
            line-height: 1.25rem;
        }

        .admin-field-input::placeholder {
            color: #64748b;
        }

        .admin-field-input:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.28);
        }

        .admin-field-input.has-trailing-action {
            padding-right: 3.35rem !important;
        }

        .admin-field-input[readonly],
        .admin-field-input:disabled {
            background: #f8fafc;
            color: #334155;
            border-color: #cbd5e1;
            cursor: not-allowed;
        }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        textarea:-webkit-autofill,
        select:-webkit-autofill {
            -webkit-text-fill-color: #0f172a !important;
            caret-color: #0f172a !important;
            transition: background-color 5000s ease-in-out 0s;
            box-shadow: 0 0 0 1000px #ffffff inset !important;
        }

        .auth-primary-button {
            min-height: 3.1rem;
        }

        @media (max-height: 720px) {
            .auth-shell-inner {
                align-items: flex-start;
                padding-top: 1.5rem;
                padding-bottom: 1.5rem;
            }

            .auth-logo {
                height: 4.75rem;
            }

            .auth-card {
                border-radius: 1.25rem;
            }
        }

        @media (max-width: 420px) {
            .auth-card {
                max-width: 100%;
            }

            .auth-logo {
                height: 5rem;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .wave path,
            .floating-shape {
                animation: none !important;
            }
        }
    </style>
</head>

<body class="text-slate-900">
    <main class="auth-shell">
        <div class="wave-container" aria-hidden="true">
            <div class="wave wave-1">
                <svg viewBox="0 0 1000 160" preserveAspectRatio="none">
                    <path d="M0,100 Q250,50 500,100 T1000,100 L1000,0 L0,0 Z"></path>
                </svg>
            </div>

            <div class="wave wave-2">
                <svg viewBox="0 0 1000 160" preserveAspectRatio="none">
                    <path d="M0,130 Q250,80 500,130 T1000,130 L1000,0 L0,0 Z"></path>
                </svg>
            </div>

            <div class="wave wave-3">
                <svg viewBox="0 0 1000 160" preserveAspectRatio="none">
                    <path d="M0,150 Q250,100 500,150 T1000,150 L1000,0 L0,0 Z"></path>
                </svg>
            </div>
        </div>

        <div class="floating-shape shape-1" aria-hidden="true"></div>
        <div class="floating-shape shape-2" aria-hidden="true"></div>
        <div class="floating-shape shape-3" aria-hidden="true"></div>
        <div class="floating-shape shape-4" aria-hidden="true"></div>

        <div class="auth-shell-inner relative z-10 min-h-screen min-h-dvh flex flex-col items-center justify-center px-4 py-8 sm:px-6">
            <section class="auth-card w-full rounded-3xl p-6 sm:p-6">
                <div class="text-center mb-6">
                    <div class="flex justify-center mb-4">
                        <img src="{{ asset('images/mainlogo.png') }}" alt="IntakeSync Logo" class="auth-logo">
                    </div>

                    <h1 class="text-2xl font-bold text-white tracking-tight">
                        @yield('auth_heading', 'Admin')
                    </h1>

                    @hasSection('auth_subheading')
                        <p class="text-sm text-slate-300 mt-2">
                            @yield('auth_subheading')
                        </p>
                    @endif
                </div>

                @yield('content')
            </section>

            <footer class="relative z-10 mt-5 text-center text-white/70 text-xs px-4">
                <p>&copy; 2026 IntakeSync Health Management System. All rights reserved.</p>
            </footer>
        </div>
    </main>

    <script>
        window.IntakeSyncAuth = {
            initPasswordToggle(buttonId, inputId, openIconId, closedIconId) {
                const button = document.getElementById(buttonId);
                const input = document.getElementById(inputId);
                const openIcon = document.getElementById(openIconId);
                const closedIcon = document.getElementById(closedIconId);

                if (!button || !input || !openIcon || !closedIcon) {
                    return;
                }

                button.addEventListener('click', () => {
                    const showingPassword = input.type === 'password';

                    input.type = showingPassword ? 'text' : 'password';
                    openIcon.classList.toggle('hidden', showingPassword);
                    closedIcon.classList.toggle('hidden', !showingPassword);
                    button.setAttribute('aria-label', showingPassword ? 'Hide password' : 'Show password');
                });
            },

            initSubmitLoading(formId, buttonId, textId, loadingText) {
                const form = document.getElementById(formId);
                const button = document.getElementById(buttonId);
                const text = document.getElementById(textId);

                if (!form || !button || !text) {
                    return;
                }

                form.addEventListener('submit', (event) => {
                    if (button.disabled) {
                        event.preventDefault();
                        return;
                    }

                    button.disabled = true;
                    text.textContent = loadingText;

                    if (!button.querySelector('[data-auth-spinner]')) {
                        const spinner = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

                        spinner.setAttribute('data-auth-spinner', 'true');
                        spinner.setAttribute('class', 'animate-spin h-5 w-5 text-white');
                        spinner.setAttribute('fill', 'none');
                        spinner.setAttribute('viewBox', '0 0 24 24');

                        spinner.innerHTML = `
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        `;

                        button.insertBefore(spinner, text);
                    }
                });
            }
        };
    </script>

    @stack('scripts')
</body>
</html>