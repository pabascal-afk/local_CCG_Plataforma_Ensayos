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
            this.Size = new Size(420, 215);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            try {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            } catch { }

            Panel pnlHeader = new Panel() {
                Dock = DockStyle.Top,
                Height = 56,
                Padding = new Padding(15, 8, 15, 4)
            };

            PictureBox picLogo = new PictureBox() {
                Size = new Size(40, 40),
                SizeMode = PictureBoxSizeMode.Zoom,
                Dock = DockStyle.Left
            };
            if (this.Icon != null) {
                try {
                    picLogo.Image = this.Icon.ToBitmap();
                } catch { }
            }

            Panel pnlTitles = new Panel() {
                Dock = DockStyle.Fill,
                Padding = new Padding(10, 2, 0, 0)
            };

            Label titleLabel = new Label() {
                Text = "Colegio Cerro Grande",
                Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(14, 61, 153),
                Dock = DockStyle.Top,
                Height = 22
            };

            Label subtitleLabel = new Label() {
                Text = "Plataforma de Ensayos SIMCE (Red Local)",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(90, 90, 90),
                Dock = DockStyle.Top,
                Height = 18
            };

            pnlTitles.Controls.Add(subtitleLabel);
            pnlTitles.Controls.Add(titleLabel);

            pnlHeader.Controls.Add(pnlTitles);
            pnlHeader.Controls.Add(picLogo);

            statusLabel = new Label() {
                Text = "Iniciando conexion con el servidor...",
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleLeft,
                Dock = DockStyle.Top,
                Height = 32,
                Padding = new Padding(16, 0, 16, 0),
                Font = new Font("Segoe UI", 9f, FontStyle.Regular)
            };

            Panel pnlProgress = new Panel() { Dock = DockStyle.Top, Height = 24, Padding = new Padding(18, 0, 18, 0) };
            progressBar = new ProgressBar() {
                Style = ProgressBarStyle.Marquee,
                Dock = DockStyle.Fill
            };
            pnlProgress.Controls.Add(progressBar);

            Panel pnlButtons = new Panel() { Dock = DockStyle.Bottom, Height = 42, Padding = new Padding(18, 5, 18, 8) };
            
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
            this.Controls.Add(pnlHeader);
            this.Controls.Add(pnlButtons);

            pnlHeader.BringToFront();
            statusLabel.BringToFront();
            pnlProgress.BringToFront();

            this.Load += async (s, e) => await CheckConnections();
        }

        private static HttpClientHandler CreateHandler() {
            var handler = new HttpClientHandler();
            handler.ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true;
            return handler;
        }

        private async Task CheckConnections() {
            var candidateHosts = new System.Collections.Generic.List<string>();

            // 0. Archivo de configuracion local opcional (server_ip.txt)
            try {
                string cfgFile = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server_ip.txt");
                if (System.IO.File.Exists(cfgFile)) {
                    string ipFromCfg = System.IO.File.ReadAllText(cfgFile).Trim();
                    if (!string.IsNullOrEmpty(ipFromCfg)) {
                        candidateHosts.Add(ipFromCfg.StartsWith("http") ? ipFromCfg : "http://" + ipFromCfg + (ipFromCfg.Contains(":") ? "" : ":3300"));
                        if (!ipFromCfg.Contains(":")) {
                            candidateHosts.Add("http://" + ipFromCfg + ":3600");
                        }
                    }
                }
            } catch { }

            candidateHosts.Add("http://localhost:3300");
            candidateHosts.Add("http://localhost:3600");
            candidateHosts.Add("http://192.168.3.16:3300");
            candidateHosts.Add("http://192.168.3.16:3600");
            candidateHosts.Add("http://192.168.0.142:3300");
            candidateHosts.Add("http://192.168.0.142:3600");
            candidateHosts.Add("http://ensayos.local:3300");
            candidateHosts.Add("http://ensayos.local:3600");

            using (HttpClient client = new HttpClient(CreateHandler())) {
                client.Timeout = TimeSpan.FromMilliseconds(2000);

                foreach (string baseUrl in candidateHosts) {
                    string cleanUrl = baseUrl.TrimEnd('/');
                    statusLabel.Text = "Buscando servidor en " + cleanUrl + "...";
                    if (await TryConnect(client, cleanUrl + "/api/health") || await TryConnect(client, cleanUrl + "/")) {
                        OpenUrl(cleanUrl);
                        return;
                    }
                }
            }

            // Si no responde
            progressBar.Style = ProgressBarStyle.Blocks;
            progressBar.Value = 100;
            statusLabel.ForeColor = Color.DarkRed;
            statusLabel.Text = "Servidor no accesible en la red local (Puertos 3300 / 3600).";
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
