using System;
using System.Drawing;
using System.Diagnostics;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Launcher {
    static class Program {
        [STAThread]
        static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    public class MainForm : Form {
        private Label statusLabel;
        private ProgressBar progressBar;
        private Button retryButton;
        private Button closeButton;

        public MainForm() {
            this.Text = "Plataforma Ensayos SIMCE - CCG";
            this.Size = new Size(390, 185);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            statusLabel = new Label() {
                Text = "Iniciando conexion con el servidor...",
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 48,
                Font = new Font("Segoe UI", 9, FontStyle.Bold)
            };

            Panel pnlProgress = new Panel() { Dock = DockStyle.Top, Height = 28, Padding = new Padding(20, 0, 20, 0) };
            progressBar = new ProgressBar() {
                Style = ProgressBarStyle.Marquee,
                Dock = DockStyle.Fill
            };
            pnlProgress.Controls.Add(progressBar);

            Panel pnlButtons = new Panel() { Dock = DockStyle.Bottom, Height = 42, Padding = new Padding(15, 5, 15, 8) };
            
            retryButton = new Button() {
                Text = "Reintentar",
                Width = 100,
                Dock = DockStyle.Left,
                Visible = false,
                Cursor = Cursors.Hand
            };
            retryButton.Click += async (s, e) => {
                retryButton.Visible = false;
                closeButton.Visible = false;
                progressBar.Style = ProgressBarStyle.Marquee;
                statusLabel.ForeColor = Color.Black;
                await CheckConnections();
            };

            closeButton = new Button() {
                Text = "Cerrar",
                Width = 100,
                Dock = DockStyle.Right,
                Visible = false,
                Cursor = Cursors.Hand
            };
            closeButton.Click += (s, e) => Application.Exit();

            pnlButtons.Controls.Add(retryButton);
            pnlButtons.Controls.Add(closeButton);

            this.Controls.Add(pnlProgress);
            this.Controls.Add(statusLabel);
            this.Controls.Add(pnlButtons);

            this.Load += async (s, e) => await CheckConnections();
        }

        private static HttpClientHandler CreateHandler() {
            var handler = new HttpClientHandler();
            handler.ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true;
            return handler;
        }

        private async Task CheckConnections() {
            string localhostUrl = "http://localhost:8000";
            string fallbackIpUrl = "http://192.168.3.16:8000";

            using (HttpClient client = new HttpClient(CreateHandler())) {
                client.Timeout = TimeSpan.FromMilliseconds(1500);

                // 1. Probar en este mismo equipo
                statusLabel.Text = "Buscando servidor en este equipo (localhost:8000)...";
                if (await TryConnect(client, localhostUrl + "/api/health")) {
                    OpenUrl(localhostUrl);
                    return;
                }

                // 2. Probar en IP de servidor habitual
                statusLabel.Text = "Buscando servidor en la red local (192.168.3.16:8000)...";
                if (await TryConnect(client, fallbackIpUrl + "/api/health")) {
                    OpenUrl(fallbackIpUrl);
                    return;
                }

                // 3. Probar por mDNS
                statusLabel.Text = "Buscando servidor por red local (ensayos.local:8000)...";
                if (await TryConnect(client, "http://ensayos.local:8000/api/health")) {
                    OpenUrl("http://ensayos.local:8000");
                    return;
                }
            }

            // Si no responde
            progressBar.Style = ProgressBarStyle.Blocks;
            progressBar.Value = 100;
            statusLabel.ForeColor = Color.DarkRed;
            statusLabel.Text = "Servidor no accesible en la red local (Puerto 8000).";
            retryButton.Visible = true;
            closeButton.Visible = true;
        }

        private async Task<bool> TryConnect(HttpClient client, string url) {
            try {
                HttpResponseMessage res = await client.GetAsync(url);
                return res.IsSuccessStatusCode;
            } catch {
                return false;
            }
        }

        private void OpenUrl(string url) {
            statusLabel.ForeColor = Color.DarkGreen;
            statusLabel.Text = "Conectado. Abriendo navegador...";
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            Task.Delay(1200).ContinueWith(_ => Application.Exit());
        }
    }
}
