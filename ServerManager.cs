using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace CCGServerManager
{
    static class Program
    {
        private static Mutex appMutex;

        [STAThread]
        static void Main(string[] args)
        {
            bool createdNew;
            appMutex = new Mutex(true, "Local\\CCG_Unified_Server_Manager_SingleInstance", out createdNew);
            if (!createdNew)
            {
                MessageBox.Show(
                    "El Gestor de Servidores CCG ya se encuentra en ejecución.\nRevisa el ícono institucional junto al reloj de Windows (Bandeja del Sistema).",
                    "Gestor de Servidores CCG",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }

            bool autoStartServers = false;
            if (args != null)
            {
                foreach (string a in args)
                {
                    if (string.Equals(a, "--autostart", StringComparison.OrdinalIgnoreCase))
                    {
                        autoStartServers = true;
                    }
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(autoStartServers));
        }
    }

    public class ManagedService
    {
        public string Id;
        public string Title;
        public string Subtitle;
        public int MainPort;
        public int BackendPort;
        public string RepoUrl;
        public bool IsNextJs;
        public string EntryScript;
        public string FolderPath;
        public Color AccentColor;

        public Process ActiveProcess;
        public bool IsBusy;
        public string BusyText;
        public string LastCommit;
        public string TunnelUrl;

        // UI Controls
        public Panel CardPanel;
        public Label StatusBadge;
        public Label CommitLabel;
        public Label PathLabel;
        public Label TunnelLabel;
        public Button BtnStart;
        public Button BtnStop;
        public Button BtnRestart;
        public Button BtnUpdate;
        public Button BtnOpenWeb;
        public Button BtnCopyTunnel;
        public Button BtnOpenTunnel;
        public RichTextBox LogBox;
    }

    public class MainForm : Form
    {
        private const string REG_RUN_PATH = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
        private const string REG_KEY_NAME = "GestorServidoresCCG";
        private const string GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwzszh_oyXrFY8S5tQhg5_JkyXL7q97jVzYHgLnMn_K0-qVowwwel0hxhdZIIMi-YWD/exec?action=get_url";

        private List<ManagedService> services = new List<ManagedService>();
        private string configFilePath;
        private string localIpAddress = "127.0.0.1";
        private bool allowExit = false;
        private bool initialAutoStart = false;

        private CheckBox chkStartup;
        private TabControl tabLogs;
        private RichTextBox generalLogBox;
        private NotifyIcon trayIcon;
        private System.Windows.Forms.Timer statusTimer;
        private Label lblHeaderIp;

        public MainForm(bool autoStartServers)
        {
            this.initialAutoStart = autoStartServers;
            this.localIpAddress = DetectLocalIp();
            this.configFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ccg_servers_config.ini");

            InitializeServicesModel();
            LoadConfig();

            BuildUserInterface();
            SetupTrayIcon();

            this.Load += async (s, e) =>
            {
                AppendLog(generalLogBox, "======================================================================");
                AppendLog(generalLogBox, "  CENTRO DE CONTROL DE SERVIDORES - COLEGIO CERRO GRANDE");
                AppendLog(generalLogBox, "  IP Red Local Detectada: " + localIpAddress);
                AppendLog(generalLogBox, "======================================================================");

                RefreshAllGitCommits();
                UpdateAllStatuses();
                await FetchExistingTunnelUrlAsync();

                statusTimer = new System.Windows.Forms.Timer();
                statusTimer.Interval = 3000;
                statusTimer.Tick += (ts, te) => UpdateAllStatuses();
                statusTimer.Start();

                if (initialAutoStart)
                {
                    AppendLog(generalLogBox, "[AUTOSTART] Inicio automático con Windows activado. Verificando y arrancando los 3 servidores...");
                    await StartAllServicesAsync();
                }
            };

            this.FormClosing += MainForm_FormClosing;
        }

        private void InitializeServicesModel()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            string parentDir = Directory.GetParent(baseDir) != null ? Directory.GetParent(baseDir).FullName : baseDir;

            string defaultSimce = AutoDetectFolder(baseDir, parentDir, new string[] { "ENSAYOS SIMCE", "local_CCG_Plataforma_Ensayos" }, false);
            string defaultPruebas = AutoDetectFolder(baseDir, parentDir, new string[] { "PRUEBAS CCG", "PRUEBAS_CCG" }, true);
            string defaultUnified = AutoDetectFolder(baseDir, parentDir, new string[] { "UNIFIED PLATAFORM", "UNIFIED PLATFORM", "local_CCG_Portal_Unificado_Plataformas" }, false);

            services.Add(new ManagedService
            {
                Id = "SIMCE",
                Title = "1. Plataforma Ensayos SIMCE",
                Subtitle = "Frontend :3300  |  API Backend :3001",
                MainPort = 3300,
                BackendPort = 3001,
                RepoUrl = "https://github.com/pabascal-afk/local_CCG_Plataforma_Ensayos.git",
                IsNextJs = true,
                EntryScript = "server.js",
                FolderPath = defaultSimce,
                AccentColor = Color.FromArgb(37, 99, 235), // Blue
                LastCommit = "Verificando...",
                TunnelUrl = ""
            });

            services.Add(new ManagedService
            {
                Id = "PRUEBAS",
                Title = "2. Plataforma Pruebas CCG",
                Subtitle = "Frontend :3600  |  API Backend :3601",
                MainPort = 3600,
                BackendPort = 3601,
                RepoUrl = "https://github.com/pabascal-afk/local_CCG_Plataforma_Ensayos.git",
                IsNextJs = true,
                EntryScript = "server.js",
                FolderPath = defaultPruebas,
                AccentColor = Color.FromArgb(5, 150, 105), // Emerald
                LastCommit = "Verificando...",
                TunnelUrl = ""
            });

            services.Add(new ManagedService
            {
                Id = "UNIFIED",
                Title = "3. Portal Unificado (Unified Platform)",
                Subtitle = "Servidor :9000  |  Túnel Público Cloudflare",
                MainPort = 9000,
                BackendPort = 0,
                RepoUrl = "https://github.com/pabascal-afk/local_CCG_Portal_Unificado_Plataformas.git",
                IsNextJs = false,
                EntryScript = "server\\index.js",
                FolderPath = defaultUnified,
                AccentColor = Color.FromArgb(124, 58, 237), // Purple
                LastCommit = "Verificando...",
                TunnelUrl = "Sin túnel detectado aún"
            });
        }

        private string AutoDetectFolder(string baseDir, string parentDir, string[] folderNames, bool isPruebas)
        {
            // 1. Check if current baseDir matches
            string baseName = Path.GetFileName(baseDir).ToUpperInvariant();
            foreach (string name in folderNames)
            {
                if (baseName.Contains(name.ToUpperInvariant()))
                {
                    return baseDir;
                }
            }

            // 2. Check sibling directories in parentDir
            foreach (string name in folderNames)
            {
                string candidate = Path.Combine(parentDir, name);
                if (Directory.Exists(candidate))
                {
                    return candidate;
                }
            }

            // 3. Check Desktop and Documents\antigravity
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            string docs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "antigravity");

            foreach (string root in new string[] { desktop, docs })
            {
                if (!Directory.Exists(root)) continue;
                foreach (string name in folderNames)
                {
                    string candidate = Path.Combine(root, name);
                    if (Directory.Exists(candidate))
                    {
                        return candidate;
                    }
                }
            }

            // Default fallback path in parentDir
            return Path.Combine(parentDir, folderNames[0]);
        }

        private void LoadConfig()
        {
            if (!File.Exists(configFilePath))
            {
                SaveConfig();
                return;
            }
            try
            {
                string[] lines = File.ReadAllLines(configFilePath, Encoding.UTF8);
                foreach (string line in lines)
                {
                    if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#")) continue;
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    string key = line.Substring(0, eq).Trim();
                    string val = line.Substring(eq + 1).Trim();
                    if (string.IsNullOrEmpty(val)) continue;

                    foreach (ManagedService s in services)
                    {
                        if (string.Equals(key, s.Id + "_PATH", StringComparison.OrdinalIgnoreCase))
                        {
                            s.FolderPath = val;
                        }
                    }
                }
            }
            catch { }
        }

        private void SaveConfig()
        {
            try
            {
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("# Configuración de Rutas - Gestor de Servidores CCG");
                foreach (ManagedService s in services)
                {
                    sb.AppendLine(s.Id + "_PATH=" + s.FolderPath);
                }
                File.WriteAllText(configFilePath, sb.ToString(), Encoding.UTF8);
            }
            catch { }
        }

        private void BuildUserInterface()
        {
            this.Text = "Gestor Unificado de Servidores CCG • Colegio Cerro Grande";
            this.Size = new Size(1120, 760);
            this.MinimumSize = new Size(980, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(241, 245, 249);
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular);

            try
            {
                string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
                if (File.Exists(icoPath))
                {
                    this.Icon = new Icon(icoPath);
                }
                else
                {
                    this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                }
            }
            catch { }

            // 1. TOP HEADER BAR
            Panel headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 68,
                BackColor = Color.FromArgb(15, 23, 42),
                Padding = new Padding(18, 10, 18, 10)
            };

            Label lblTitle = new Label
            {
                Text = "COLEGIO CERRO GRANDE  •  CENTRO DE SERVIDORES",
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 12F, FontStyle.Bold),
                AutoSize = true,
                Location = new Point(18, 11)
            };

            lblHeaderIp = new Label
            {
                Text = string.Format("IP Servidor LAN: {0}   |   Puertos Activos: SIMCE (:3300) • PRUEBAS (:3600) • UNIFIED (:9000 + Túnel)", localIpAddress),
                ForeColor = Color.FromArgb(148, 163, 184),
                Font = new Font("Segoe UI", 8.8F, FontStyle.Regular),
                AutoSize = true,
                Location = new Point(18, 37)
            };

            // Global action buttons on the right of header
            FlowLayoutPanel headerActions = new FlowLayoutPanel
            {
                Dock = DockStyle.Right,
                AutoSize = true,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                Padding = new Padding(0, 6, 0, 0),
                BackColor = Color.Transparent
            };

            Button btnStartAll = CreateStyledButton("▶ Iniciar los 3", Color.FromArgb(22, 163, 74), Color.White, 125, 34);
            btnStartAll.Click += async (s, e) => await StartAllServicesAsync();

            Button btnStopAll = CreateStyledButton("⏹ Detener Todos", Color.FromArgb(220, 38, 38), Color.White, 130, 34);
            btnStopAll.Click += async (s, e) => await StopAllServicesAsync();

            Button btnUpdateAll = CreateStyledButton("⬇️ Actualizar los 3 (Git)", Color.FromArgb(37, 99, 235), Color.White, 165, 34);
            btnUpdateAll.Click += async (s, e) => await UpdateAllServicesAsync();

            headerActions.Controls.Add(btnStartAll);
            headerActions.Controls.Add(btnStopAll);
            headerActions.Controls.Add(btnUpdateAll);

            headerPanel.Controls.Add(headerActions);
            headerPanel.Controls.Add(lblTitle);
            headerPanel.Controls.Add(lblHeaderIp);

            // 2. SUB-BAR FOR WINDOWS AUTOSTART & QUICK INFO
            Panel subHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 38,
                BackColor = Color.FromArgb(226, 232, 240),
                Padding = new Padding(18, 6, 18, 6)
            };

            chkStartup = new CheckBox
            {
                Text = "Iniciar automáticamente con Windows y encender los 3 servidores al arrancar el equipo",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 41, 59),
                AutoSize = true,
                Location = new Point(18, 8),
                Checked = IsStartupEnabled()
            };
            chkStartup.CheckedChanged += (s, e) => SetStartupEnabled(chkStartup.Checked);

            Label lblTrayHint = new Label
            {
                Text = "💡 Al cerrar esta ventana (X), los servidores seguirán activos junto al reloj de Windows.",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Italic),
                ForeColor = Color.FromArgb(71, 85, 105),
                AutoSize = true,
                Dock = DockStyle.Right
            };

            subHeader.Controls.Add(lblTrayHint);
            subHeader.Controls.Add(chkStartup);

            // 3. CARDS CONTAINER (3 COLUMNS)
            TableLayoutPanel cardsGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 310,
                ColumnCount = 3,
                RowCount = 1,
                Padding = new Padding(12, 10, 12, 6),
                BackColor = Color.FromArgb(241, 245, 249)
            };
            cardsGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33F));
            cardsGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33F));
            cardsGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.34F));
            cardsGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));

            for (int i = 0; i < services.Count; i++)
            {
                Panel card = BuildServiceCard(services[i]);
                cardsGrid.Controls.Add(card, i, 0);
            }

            // 4. BOTTOM LOGS TAB CONTROL
            Panel logsContainer = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(14, 4, 14, 12),
                BackColor = Color.FromArgb(241, 245, 249)
            };

            tabLogs = new TabControl
            {
                Dock = DockStyle.Fill,
                Font = new Font("Segoe UI", 9F, FontStyle.Bold)
            };

            TabPage tabGeneral = new TabPage("📋 Registro General y Actualizaciones");
            generalLogBox = CreateTerminalBox();
            tabGeneral.Controls.Add(generalLogBox);
            tabLogs.TabPages.Add(tabGeneral);

            foreach (ManagedService srv in services)
            {
                TabPage tp = new TabPage(string.Format("🖥 Consola {0} (:{1})", srv.Id, srv.MainPort));
                srv.LogBox = CreateTerminalBox();
                tp.Controls.Add(srv.LogBox);
                tabLogs.TabPages.Add(tp);
            }

            logsContainer.Controls.Add(tabLogs);

            // Add in docking order
            this.Controls.Add(logsContainer);
            this.Controls.Add(cardsGrid);
            this.Controls.Add(subHeader);
            this.Controls.Add(headerPanel);
        }

        private Panel BuildServiceCard(ManagedService srv)
        {
            Panel card = new Panel
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(6),
                BackColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };
            srv.CardPanel = card;

            // Top color strip
            Panel topStrip = new Panel
            {
                Dock = DockStyle.Top,
                Height = 6,
                BackColor = srv.AccentColor
            };

            Panel body = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(12, 8, 12, 8)
            };

            // Server Logo Icon (36x36)
            PictureBox picLogo = new PictureBox
            {
                Location = new Point(12, 8),
                Size = new Size(36, 36),
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.Transparent
            };
            try
            {
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                string icoName = srv.Id == "SIMCE" ? "app_simce.ico" : (srv.Id == "PRUEBAS" ? "app_pruebas.ico" : "app.ico");
                string icoFull = Path.Combine(exeDir, icoName);
                if (!File.Exists(icoFull) && !string.IsNullOrEmpty(srv.FolderPath))
                    icoFull = Path.Combine(srv.FolderPath, icoName);
                if (!File.Exists(icoFull))
                    icoFull = Path.Combine(exeDir, "app.ico");
                if (File.Exists(icoFull))
                {
                    using (Icon ic = new Icon(icoFull, 48, 48))
                    {
                        picLogo.Image = ic.ToBitmap();
                    }
                }
            }
            catch { }

            // Title & Subtitle
            Label lblTitle = new Label
            {
                Text = srv.Title,
                Font = new Font("Segoe UI", 10.2F, FontStyle.Bold),
                ForeColor = Color.FromArgb(15, 23, 42),
                Location = new Point(54, 7),
                AutoSize = true
            };

            Label lblSub = new Label
            {
                Text = srv.Subtitle,
                Font = new Font("Segoe UI", 8.0F, FontStyle.Regular),
                ForeColor = Color.FromArgb(100, 116, 139),
                Location = new Point(54, 29),
                AutoSize = true
            };
            body.Controls.Add(picLogo);

            // Status Badge
            Label badge = new Label
            {
                Text = "VERIFICANDO...",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(12, 54),
                Size = new Size(310, 26),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                BackColor = Color.FromArgb(226, 232, 240),
                ForeColor = Color.FromArgb(51, 65, 85)
            };
            srv.StatusBadge = badge;

            // Git commit label
            Label lblCommit = new Label
            {
                Text = "Git: " + srv.LastCommit,
                Font = new Font("Consolas", 8.2F, FontStyle.Regular),
                ForeColor = Color.FromArgb(71, 85, 105),
                Location = new Point(12, 86),
                Size = new Size(310, 18),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                AutoEllipsis = true
            };
            srv.CommitLabel = lblCommit;

            // Folder Path & Browse button
            Label lblPath = new Label
            {
                Text = "Carpeta: " + srv.FolderPath,
                Font = new Font("Segoe UI", 7.8F, FontStyle.Regular),
                ForeColor = Color.FromArgb(100, 116, 139),
                Location = new Point(12, 106),
                Size = new Size(235, 18),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                AutoEllipsis = true
            };
            srv.PathLabel = lblPath;

            Button btnBrowse = new Button
            {
                Text = "📁 Ruta",
                Font = new Font("Segoe UI", 7.5F, FontStyle.Bold),
                Size = new Size(68, 22),
                Location = new Point(254, 103),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                BackColor = Color.FromArgb(241, 245, 249),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnBrowse.FlatAppearance.BorderColor = Color.FromArgb(203, 213, 225);
            btnBrowse.Click += (s, e) => BrowseServiceFolder(srv);

            // Tunnel or Network Box (Row at Y=130)
            Panel infoBox = new Panel
            {
                Location = new Point(12, 130),
                Size = new Size(310, 50),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                BackColor = Color.FromArgb(248, 250, 252),
                BorderStyle = BorderStyle.FixedSingle
            };

            if (srv.Id == "UNIFIED")
            {
                Label lblTunHeader = new Label
                {
                    Text = "☁️ Túnel Cloudflare Público:",
                    Font = new Font("Segoe UI", 7.8F, FontStyle.Bold),
                    ForeColor = Color.FromArgb(109, 40, 217),
                    Location = new Point(6, 4),
                    AutoSize = true
                };

                Label lblTunUrl = new Label
                {
                    Text = srv.TunnelUrl,
                    Font = new Font("Consolas", 8F, FontStyle.Bold),
                    ForeColor = Color.FromArgb(30, 41, 59),
                    Location = new Point(6, 22),
                    Size = new Size(195, 20),
                    AutoEllipsis = true
                };
                srv.TunnelLabel = lblTunUrl;

                Button btnCopyTun = new Button
                {
                    Text = "Copiar",
                    Font = new Font("Segoe UI", 7.2F, FontStyle.Bold),
                    Size = new Size(48, 22),
                    Location = new Point(204, 19),
                    Anchor = AnchorStyles.Top | AnchorStyles.Right,
                    BackColor = Color.White,
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand
                };
                btnCopyTun.Click += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(srv.TunnelUrl) && srv.TunnelUrl.StartsWith("http"))
                    {
                        Clipboard.SetText(srv.TunnelUrl);
                        AppendLog(generalLogBox, "[TÚNEL] URL copiada al portapapeles: " + srv.TunnelUrl);
                    }
                };

                Button btnOpenTun = new Button
                {
                    Text = "Abrir",
                    Font = new Font("Segoe UI", 7.2F, FontStyle.Bold),
                    Size = new Size(48, 22),
                    Location = new Point(255, 19),
                    Anchor = AnchorStyles.Top | AnchorStyles.Right,
                    BackColor = Color.White,
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand
                };
                btnOpenTun.Click += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(srv.TunnelUrl) && srv.TunnelUrl.StartsWith("http"))
                    {
                        Process.Start(new ProcessStartInfo(srv.TunnelUrl) { UseShellExecute = true });
                    }
                };

                infoBox.Controls.Add(lblTunHeader);
                infoBox.Controls.Add(lblTunUrl);
                infoBox.Controls.Add(btnCopyTun);
                infoBox.Controls.Add(btnOpenTun);
            }
            else
            {
                Label lblLanInfo = new Label
                {
                    Text = string.Format("🌐 Acceso Red Local (LAN):\nhttp://{0}:{1}", localIpAddress, srv.MainPort),
                    Font = new Font("Consolas", 8.2F, FontStyle.Regular),
                    ForeColor = Color.FromArgb(51, 65, 85),
                    Location = new Point(6, 7),
                    AutoSize = true
                };
                infoBox.Controls.Add(lblLanInfo);
            }

            // Action Buttons Row 1: Iniciar | Detener | Reiniciar (Y=188)
            Button btnStart = CreateStyledButton("▶ Iniciar", Color.FromArgb(22, 163, 74), Color.White, 98, 30);
            btnStart.Location = new Point(12, 188);
            btnStart.Click += async (s, e) => await StartServiceAsync(srv);
            srv.BtnStart = btnStart;

            Button btnStop = CreateStyledButton("⏹ Detener", Color.FromArgb(220, 38, 38), Color.White, 98, 30);
            btnStop.Location = new Point(116, 188);
            btnStop.Click += async (s, e) => await StopServiceAsync(srv);
            srv.BtnStop = btnStop;

            Button btnRestart = CreateStyledButton("🔄 Reiniciar", Color.FromArgb(217, 119, 6), Color.White, 102, 30);
            btnRestart.Location = new Point(220, 188);
            btnRestart.Click += async (s, e) =>
            {
                await StopServiceAsync(srv);
                await StartServiceAsync(srv);
            };
            srv.BtnRestart = btnRestart;

            // Action Buttons Row 2: Actualizar desde GitHub | Abrir en Navegador (Y=226)
            Button btnUpdate = CreateStyledButton("⬇️ Actualizar (Git Pull + Build)", srv.AccentColor, Color.White, 202, 34);
            btnUpdate.Location = new Point(12, 226);
            btnUpdate.Click += async (s, e) => await UpdateServiceAsync(srv);
            srv.BtnUpdate = btnUpdate;

            Button btnOpenWeb = CreateStyledButton("🌐 Abrir Web", Color.FromArgb(51, 65, 85), Color.White, 102, 34);
            btnOpenWeb.Location = new Point(220, 226);
            btnOpenWeb.Click += (s, e) =>
            {
                string url = string.Format("http://localhost:{0}", srv.MainPort);
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            };
            srv.BtnOpenWeb = btnOpenWeb;

            body.Controls.Add(lblTitle);
            body.Controls.Add(lblSub);
            body.Controls.Add(badge);
            body.Controls.Add(lblCommit);
            body.Controls.Add(lblPath);
            body.Controls.Add(btnBrowse);
            body.Controls.Add(infoBox);
            body.Controls.Add(btnStart);
            body.Controls.Add(btnStop);
            body.Controls.Add(btnRestart);
            body.Controls.Add(btnUpdate);
            body.Controls.Add(btnOpenWeb);

            card.Controls.Add(body);
            card.Controls.Add(topStrip);

            return card;
        }

        private Button CreateStyledButton(string text, Color bg, Color fg, int width, int height)
        {
            Button btn = new Button
            {
                Text = text,
                Size = new Size(width, height),
                BackColor = bg,
                ForeColor = fg,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 8.2F, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderSize = 0;
            return btn;
        }

        private RichTextBox CreateTerminalBox()
        {
            return new RichTextBox
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.FromArgb(226, 232, 240),
                Font = new Font("Consolas", 9F, FontStyle.Regular),
                ReadOnly = true,
                BorderStyle = BorderStyle.None,
                DetectUrls = true
            };
        }

        private void SetupTrayIcon()
        {
            ContextMenu trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("🖥️ Mostrar Panel de Control CCG", (s, e) => ShowMainWindow());
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("▶ Iniciar los 3 Servidores", async (s, e) => await StartAllServicesAsync());
            trayMenu.MenuItems.Add("⬇️ Actualizar los 3 desde GitHub", async (s, e) =>
            {
                ShowMainWindow();
                await UpdateAllServicesAsync();
            });
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("🌐 Abrir Ensayos SIMCE (:3300)", (s, e) => Process.Start("http://localhost:3300"));
            trayMenu.MenuItems.Add("🌐 Abrir Pruebas CCG (:3600)", (s, e) => Process.Start("http://localhost:3600"));
            trayMenu.MenuItems.Add("🌐 Abrir Portal Unificado (:9000)", (s, e) => Process.Start("http://localhost:9000"));
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("❌ Apagar Todos los Servidores y Salir", async (s, e) =>
            {
                allowExit = true;
                await StopAllServicesAsync();
                trayIcon.Visible = false;
                Application.Exit();
            });

            trayIcon = new NotifyIcon
            {
                Text = "Gestor de Servidores CCG (SIMCE / Pruebas / Unified)",
                Icon = this.Icon ?? SystemIcons.Application,
                ContextMenu = trayMenu,
                Visible = true
            };
            trayIcon.DoubleClick += (s, e) => ShowMainWindow();
        }

        private void ShowMainWindow()
        {
            this.Show();
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
            this.Activate();
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (!allowExit && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.Hide();
                trayIcon.ShowBalloonTip(
                    3000,
                    "Gestor de Servidores CCG Activo",
                    "Los servidores continúan funcionando en segundo plano. Haz doble clic en este ícono para abrir el panel.",
                    ToolTipIcon.Info
                );
            }
        }

        private void BrowseServiceFolder(ManagedService srv)
        {
            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Selecciona la carpeta raíz de: " + srv.Title;
                if (Directory.Exists(srv.FolderPath))
                {
                    fbd.SelectedPath = srv.FolderPath;
                }
                if (fbd.ShowDialog(this) == DialogResult.OK)
                {
                    srv.FolderPath = fbd.SelectedPath;
                    srv.PathLabel.Text = "Carpeta: " + srv.FolderPath;
                    SaveConfig();
                    RefreshGitCommit(srv);
                    AppendLog(generalLogBox, string.Format("[CONFIG] Ruta de {0} actualizada a: {1}", srv.Id, srv.FolderPath));
                }
            }
        }

        // =========================================================================
        // NETWORK & PORT UTILITIES
        // =========================================================================

        private string DetectLocalIp()
        {
            try
            {
                string candidate = "127.0.0.1";
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    string desc = (ni.Name + " " + ni.Description).ToLowerInvariant();
                    if (desc.Contains("virtual") || desc.Contains("vmware") || desc.Contains("wsl") || desc.Contains("loopback"))
                        continue;

                    foreach (UnicastIPAddressInformation ip in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ip.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip.Address))
                        {
                            string addr = ip.Address.ToString();
                            if (addr.StartsWith("192.168.3.")) return addr;
                            candidate = addr;
                        }
                    }
                }
                return candidate;
            }
            catch
            {
                return "127.0.0.1";
            }
        }

        private bool IsPortListening(int port)
        {
            if (port <= 0) return false;
            try
            {
                IPGlobalProperties props = IPGlobalProperties.GetIPGlobalProperties();
                IPEndPoint[] endpoints = props.GetActiveTcpListeners();
                foreach (IPEndPoint ep in endpoints)
                {
                    if (ep.Port == port) return true;
                }
            }
            catch { }
            return false;
        }

        private void UpdateAllStatuses()
        {
            if (this.IsDisposed) return;

            foreach (ManagedService srv in services)
            {
                if (srv.IsBusy)
                {
                    srv.StatusBadge.Text = "🟡 " + (srv.BusyText ?? "PROCESANDO...");
                    srv.StatusBadge.BackColor = Color.FromArgb(254, 243, 199);
                    srv.StatusBadge.ForeColor = Color.FromArgb(180, 83, 9);
                    continue;
                }

                bool mainUp = IsPortListening(srv.MainPort);
                bool backUp = srv.BackendPort == 0 || IsPortListening(srv.BackendPort);

                if (mainUp && backUp)
                {
                    srv.StatusBadge.Text = string.Format("🟢 EN LÍNEA  (Puerto :{0} Activo)", srv.MainPort);
                    srv.StatusBadge.BackColor = Color.FromArgb(209, 250, 229);
                    srv.StatusBadge.ForeColor = Color.FromArgb(6, 95, 70);
                }
                else if (mainUp || (srv.BackendPort > 0 && IsPortListening(srv.BackendPort)))
                {
                    srv.StatusBadge.Text = string.Format("🟡 INICIANDO SERVICIOS (:{0})...", srv.MainPort);
                    srv.StatusBadge.BackColor = Color.FromArgb(254, 243, 199);
                    srv.StatusBadge.ForeColor = Color.FromArgb(180, 83, 9);
                }
                else
                {
                    srv.StatusBadge.Text = "🔴 DETENIDO";
                    srv.StatusBadge.BackColor = Color.FromArgb(254, 226, 226);
                    srv.StatusBadge.ForeColor = Color.FromArgb(153, 27, 27);
                }
            }
        }

        private async Task FetchExistingTunnelUrlAsync()
        {
            ManagedService unified = services.Find(s => s.Id == "UNIFIED");
            if (unified == null || !IsPortListening(unified.MainPort)) return;

            await Task.Run(() =>
            {
                try
                {
                    ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
                    using (WebClient wc = new WebClient())
                    {
                        string url = wc.DownloadString(GAS_WEBHOOK_URL).Trim();
                        if (url.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                        {
                            unified.TunnelUrl = url;
                            this.BeginInvoke((Action)(() =>
                            {
                                if (unified.TunnelLabel != null)
                                    unified.TunnelLabel.Text = url;
                            }));
                        }
                    }
                }
                catch { }
            });
        }

        // =========================================================================
        // START / STOP / UPDATE LOGIC
        // =========================================================================

        private async Task StartAllServicesAsync()
        {
            foreach (ManagedService srv in services)
            {
                if (!IsPortListening(srv.MainPort) && !srv.IsBusy)
                {
                    await StartServiceAsync(srv);
                }
            }
        }

        private async Task StopAllServicesAsync()
        {
            foreach (ManagedService srv in services)
            {
                await StopServiceAsync(srv);
            }
        }

        private async Task UpdateAllServicesAsync()
        {
            tabLogs.SelectedIndex = 0;
            AppendLog(generalLogBox, "======================================================================");
            AppendLog(generalLogBox, "[ACTUALIZACIÓN GLOBAL] Iniciando actualización secuencial de las 3 plataformas...");
            AppendLog(generalLogBox, "======================================================================");

            foreach (ManagedService srv in services)
            {
                await UpdateServiceAsync(srv);
            }

            AppendLog(generalLogBox, "🎉 [ACTUALIZACIÓN GLOBAL FINALIZADA] Las 3 plataformas están al día y en línea.");
        }

        private async Task StartServiceAsync(ManagedService srv)
        {
            if (srv.IsBusy) return;

            if (!Directory.Exists(srv.FolderPath))
            {
                AppendLog(generalLogBox, string.Format("[AVISO] La carpeta de {0} no existe en '{1}'. Iniciando instalación automática...", srv.Id, srv.FolderPath));
                await UpdateServiceAsync(srv);
                return;
            }

            string entryFull = Path.Combine(srv.FolderPath, srv.EntryScript);
            if (!File.Exists(entryFull))
            {
                MessageBox.Show(
                    string.Format("No se encontró el archivo '{0}' en:\n{1}\n\nVerifica la ruta con el botón '📁 Ruta' o presiona 'Actualizar' para clonar el repositorio.", srv.EntryScript, srv.FolderPath),
                    "Archivo no encontrado",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            srv.IsBusy = true;
            srv.BusyText = "ARRANCANDO SERVIDOR...";
            UpdateAllStatuses();

            AppendLog(generalLogBox, string.Format("▶ Iniciando {0} en puerto :{1}...", srv.Title, srv.MainPort));
            AppendLog(srv.LogBox, string.Format("================ INICIANDO {0} (:{1}) ================", srv.Title, srv.MainPort));

            await Task.Run(() =>
            {
                try
                {
                    // Ensure PRUEBAS has isolated port 3601 in backend/.env
                    if (srv.Id == "PRUEBAS")
                    {
                        EnsurePruebasEnv(srv.FolderPath);
                    }

                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = "node",
                        Arguments = "\"" + entryFull + "\"",
                        WorkingDirectory = srv.FolderPath,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        StandardOutputEncoding = Encoding.UTF8,
                        StandardErrorEncoding = Encoding.UTF8
                    };

                    psi.EnvironmentVariables["PORT"] = srv.MainPort.ToString();
                    if (srv.BackendPort > 0)
                    {
                        psi.EnvironmentVariables["BACKEND_PORT"] = srv.BackendPort.ToString();
                        psi.EnvironmentVariables["API_INTERNAL_URL"] = "http://127.0.0.1:" + srv.BackendPort.ToString();
                    }

                    Process proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
                    proc.OutputDataReceived += (s, e) =>
                    {
                        if (e.Data != null)
                        {
                            AppendLog(srv.LogBox, e.Data);
                            CheckForTunnelUrl(srv, e.Data);
                        }
                    };
                    proc.ErrorDataReceived += (s, e) =>
                    {
                        if (e.Data != null)
                        {
                            AppendLog(srv.LogBox, "[ERR] " + e.Data);
                            CheckForTunnelUrl(srv, e.Data);
                        }
                    };

                    proc.Start();
                    proc.BeginOutputReadLine();
                    proc.BeginErrorReadLine();
                    srv.ActiveProcess = proc;

                    // Wait up to 6 seconds for port to come up
                    for (int i = 0; i < 12; i++)
                    {
                        Thread.Sleep(500);
                        if (IsPortListening(srv.MainPort)) break;
                    }
                }
                catch (Exception ex)
                {
                    AppendLog(generalLogBox, string.Format("❌ [ERROR] Falló inicio de {0}: {1}", srv.Title, ex.Message));
                }
            });

            srv.IsBusy = false;
            UpdateAllStatuses();
        }

        private void CheckForTunnelUrl(ManagedService srv, string line)
        {
            if (srv.Id != "UNIFIED" || string.IsNullOrEmpty(line)) return;
            Match m = Regex.Match(line, @"https://[a-zA-Z0-9-]+\.trycloudflare\.com");
            if (m.Success)
            {
                string url = m.Value;
                srv.TunnelUrl = url;
                if (this.IsHandleCreated)
                {
                    this.BeginInvoke((Action)(() =>
                    {
                        if (srv.TunnelLabel != null)
                            srv.TunnelLabel.Text = url;
                        AppendLog(generalLogBox, "☁️ [TÚNEL CLOUDFLARE ACTIVO] " + url);
                    }));
                }
            }
        }

        private async Task StopServiceAsync(ManagedService srv)
        {
            srv.IsBusy = true;
            srv.BusyText = "DETENIENDO...";
            UpdateAllStatuses();

            AppendLog(generalLogBox, string.Format("⏹ Deteniendo {0} (Liberando puerto :{1})...", srv.Title, srv.MainPort));

            await Task.Run(() =>
            {
                KillServiceProcesses(srv);
                Thread.Sleep(600);
            });

            srv.IsBusy = false;
            UpdateAllStatuses();
            AppendLog(generalLogBox, string.Format("✔ {0} detenido correctamente.", srv.Title));
        }

        private void KillServiceProcesses(ManagedService srv)
        {
            // 1. Kill tracked process tree
            if (srv.ActiveProcess != null)
            {
                try
                {
                    if (!srv.ActiveProcess.HasExited)
                    {
                        RunSilentCommand("taskkill", "/F /T /PID " + srv.ActiveProcess.Id);
                    }
                }
                catch { }
                srv.ActiveProcess = null;
            }

            // 2. Kill any process listening on MainPort or BackendPort (exclusively!)
            KillProcessByPort(srv.MainPort);
            if (srv.BackendPort > 0)
            {
                KillProcessByPort(srv.BackendPort);
            }
        }

        private void KillProcessByPort(int port)
        {
            if (port <= 0) return;
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "netstat",
                    Arguments = "-ano -p tcp",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true
                };
                using (Process p = Process.Start(psi))
                {
                    string output = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(3000);

                    string[] lines = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    string portToken = ":" + port.ToString() + " ";
                    HashSet<int> pids = new HashSet<int>();

                    foreach (string line in lines)
                    {
                        if (line.IndexOf("LISTENING", StringComparison.OrdinalIgnoreCase) >= 0 && line.Contains(portToken))
                        {
                            string[] parts = line.Trim().Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                            if (parts.Length >= 5)
                            {
                                int pid;
                                if (int.TryParse(parts[parts.Length - 1], out pid) && pid > 4 && pid != Process.GetCurrentProcess().Id)
                                {
                                    pids.Add(pid);
                                }
                            }
                        }
                    }

                    foreach (int pid in pids)
                    {
                        RunSilentCommand("taskkill", "/F /T /PID " + pid);
                    }
                }
            }
            catch { }
        }

        private async Task UpdateServiceAsync(ManagedService srv)
        {
            if (srv.IsBusy) return;

            tabLogs.SelectedIndex = 0; // Focus general update log tab
            srv.IsBusy = true;
            srv.BusyText = "ACTUALIZANDO DESDE GITHUB...";
            UpdateAllStatuses();

            AppendLog(generalLogBox, "----------------------------------------------------------------------");
            AppendLog(generalLogBox, string.Format("⬇️ [INICIANDO ACTUALIZACIÓN] {0}", srv.Title));
            AppendLog(generalLogBox, string.Format("   Carpeta destino: {0}", srv.FolderPath));
            AppendLog(generalLogBox, "----------------------------------------------------------------------");

            await Task.Run(() =>
            {
                try
                {
                    // 1. Stop service ports cleanly
                    srv.BusyText = "DETENIENDO PUERTOS...";
                    this.BeginInvoke((Action)UpdateAllStatuses);
                    AppendLog(generalLogBox, string.Format("[1/4] Deteniendo procesos previos en puerto :{0}...", srv.MainPort));
                    KillServiceProcesses(srv);
                    Thread.Sleep(500);

                    // 2. Clone or Pull Git Repository
                    srv.BusyText = "DESCARGANDO GITHUB (GIT PULL)...";
                    this.BeginInvoke((Action)UpdateAllStatuses);

                    if (!Directory.Exists(srv.FolderPath) || !Directory.Exists(Path.Combine(srv.FolderPath, ".git")))
                    {
                        AppendLog(generalLogBox, "[2/4] Carpeta no inicializada con Git. Clonando repositorio...");
                        Directory.CreateDirectory(srv.FolderPath);
                        RunCommandWithLogs("git", "config --global http.sslVerify false", srv.FolderPath, generalLogBox);
                        RunCommandWithLogs("git", string.Format("clone {0} \"{1}\"", srv.RepoUrl, srv.FolderPath), Path.GetDirectoryName(srv.FolderPath), generalLogBox);
                    }
                    else
                    {
                        AppendLog(generalLogBox, "[2/4] Descargando últimos cambios desde GitHub (origin/main)...");
                        RunCommandWithLogs("git", "config http.sslVerify false", srv.FolderPath, generalLogBox);
                        RunCommandWithLogs("git", "fetch origin main", srv.FolderPath, generalLogBox);
                        int resetCode = RunCommandWithLogs("git", "reset --hard origin/main", srv.FolderPath, generalLogBox);
                        if (resetCode != 0)
                        {
                            RunCommandWithLogs("git", "stash", srv.FolderPath, generalLogBox);
                            RunCommandWithLogs("git", "pull origin main", srv.FolderPath, generalLogBox);
                        }
                    }

                    // 3. Build & Sync dependencies according to project type
                    if (srv.IsNextJs)
                    {
                        if (srv.Id == "PRUEBAS")
                        {
                            EnsurePruebasEnv(srv.FolderPath);
                        }

                        string backendDir = Path.Combine(srv.FolderPath, "backend");
                        string frontendDir = Path.Combine(srv.FolderPath, "frontend");

                        srv.BusyText = "SINCRONIZANDO BASE DE DATOS...";
                        this.BeginInvoke((Action)UpdateAllStatuses);
                        AppendLog(generalLogBox, "[3/4] Sincronizando esquema SQLite con Prisma...");

                        if (!Directory.Exists(Path.Combine(backendDir, "node_modules")))
                        {
                            AppendLog(generalLogBox, "      Instalando dependencias de backend...");
                            RunCommandWithLogs("cmd.exe", "/c npm install --no-audit", backendDir, generalLogBox);
                        }

                        string prismaJs = Path.Combine(backendDir, "node_modules", "prisma", "build", "index.js");
                        if (File.Exists(prismaJs))
                        {
                            RunCommandWithLogs("node", "\"" + prismaJs + "\" db push --accept-data-loss", backendDir, generalLogBox);
                            RunCommandWithLogs("node", "\"" + prismaJs + "\" generate", backendDir, generalLogBox);
                        }

                        srv.BusyText = "COMPILANDO NEXT.JS (BUILD)...";
                        this.BeginInvoke((Action)UpdateAllStatuses);
                        AppendLog(generalLogBox, string.Format("[4/4] Compilando Frontend Next.js para producción (Puerto :{0})...", srv.MainPort));

                        if (!Directory.Exists(Path.Combine(frontendDir, "node_modules", "qrcode")))
                        {
                            AppendLog(generalLogBox, "      Instalando paquetes de frontend...");
                            RunCommandWithLogs("cmd.exe", "/c npm install --no-audit", frontendDir, generalLogBox);
                        }

                        string nextBin = Path.Combine(frontendDir, "node_modules", "next", "dist", "bin", "next");
                        Dictionary<string, string> buildEnv = new Dictionary<string, string>
                        {
                            { "PORT", srv.MainPort.ToString() },
                            { "BACKEND_PORT", srv.BackendPort.ToString() },
                            { "API_INTERNAL_URL", "http://127.0.0.1:" + srv.BackendPort.ToString() },
                            { "NEXT_TELEMETRY_DISABLED", "1" }
                        };

                        int buildCode = RunCommandWithLogs("node", "\"" + nextBin + "\" build", frontendDir, generalLogBox, buildEnv);
                        if (buildCode != 0)
                        {
                            AppendLog(generalLogBox, "[AVISO] Reintentando tras verificar npm install...");
                            RunCommandWithLogs("cmd.exe", "/c npm install --no-audit", frontendDir, generalLogBox);
                            RunCommandWithLogs("node", "\"" + nextBin + "\" build", frontendDir, generalLogBox, buildEnv);
                        }
                    }
                    else
                    {
                        // UNIFIED PLATFORM
                        srv.BusyText = "ACTUALIZANDO MÓDULOS Y DB...";
                        this.BeginInvoke((Action)UpdateAllStatuses);
                        AppendLog(generalLogBox, "[3/4] Verificando dependencias npm en UNIFIED PLATAFORM...");
                        RunCommandWithLogs("cmd.exe", "/c npm install --no-audit", srv.FolderPath, generalLogBox);

                        string initDb = Path.Combine(srv.FolderPath, "server", "db", "init_db.js");
                        if (File.Exists(initDb))
                        {
                            AppendLog(generalLogBox, "[4/4] Inicializando/verificando esquema de base de datos...");
                            RunCommandWithLogs("node", "\"" + initDb + "\"", srv.FolderPath, generalLogBox);
                        }
                    }
                }
                catch (Exception ex)
                {
                    AppendLog(generalLogBox, "❌ [ERROR EN ACTUALIZACIÓN]: " + ex.Message);
                }
            });

            RefreshGitCommit(srv);
            srv.IsBusy = false;
            UpdateAllStatuses();

            // Restart server automatically after update
            await StartServiceAsync(srv);
            AppendLog(generalLogBox, string.Format("✅ [ÉXITO] {0} actualizado y en línea en http://{1}:{2}", srv.Title, localIpAddress, srv.MainPort));
        }

        private void EnsurePruebasEnv(string pruebasFolder)
        {
            try
            {
                string backendDir = Path.Combine(pruebasFolder, "backend");
                Directory.CreateDirectory(backendDir);
                string envFile = Path.Combine(backendDir, ".env");
                if (!File.Exists(envFile))
                {
                    StringBuilder sb = new StringBuilder();
                    sb.AppendLine("DATABASE_URL=\"file:./simce.db?connection_limit=1&socket_timeout=10\"");
                    sb.AppendLine("JWT_SECRET=\"5deea0503538dd87b4faa6afada5765cc96ca39dbb0167ccf0ac52566b73284686ceb9ff631020786a4aaae74ef95c74\"");
                    sb.AppendLine("PORT=3601");
                    sb.AppendLine("HOST=127.0.0.1");
                    sb.AppendLine("UPLOADS_DIR=./uploads");
                    File.WriteAllText(envFile, sb.ToString(), Encoding.UTF8);
                }
            }
            catch { }
        }

        // =========================================================================
        // COMMAND RUNNER & GIT COMMIT HELPERS
        // =========================================================================

        private int RunCommandWithLogs(string fileName, string arguments, string workingDir, RichTextBox targetLog, Dictionary<string, string> extraEnv = null)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    WorkingDirectory = Directory.Exists(workingDir) ? workingDir : AppDomain.CurrentDomain.BaseDirectory,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };

                if (extraEnv != null)
                {
                    foreach (KeyValuePair<string, string> kv in extraEnv)
                    {
                        psi.EnvironmentVariables[kv.Key] = kv.Value;
                    }
                }

                using (Process p = new Process { StartInfo = psi })
                {
                    p.OutputDataReceived += (s, e) => { if (e.Data != null) AppendLog(targetLog, "  " + e.Data); };
                    p.ErrorDataReceived += (s, e) => { if (e.Data != null) AppendLog(targetLog, "  " + e.Data); };
                    p.Start();
                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    p.WaitForExit();
                    return p.ExitCode;
                }
            }
            catch (Exception ex)
            {
                AppendLog(targetLog, "  [Error comando " + fileName + "]: " + ex.Message);
                return -1;
            }
        }

        private void RunSilentCommand(string fileName, string arguments)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(3000);
                }
            }
            catch { }
        }

        private void RefreshAllGitCommits()
        {
            foreach (ManagedService srv in services)
            {
                RefreshGitCommit(srv);
            }
        }

        private void RefreshGitCommit(ManagedService srv)
        {
            Task.Run(() =>
            {
                string info = "Carpeta no encontrada";
                if (Directory.Exists(srv.FolderPath))
                {
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo
                        {
                            FileName = "git",
                            Arguments = "log -1 --format=\"%h • %cr (%s)\"",
                            WorkingDirectory = srv.FolderPath,
                            UseShellExecute = false,
                            CreateNoWindow = true,
                            RedirectStandardOutput = true,
                            StandardOutputEncoding = Encoding.UTF8
                        };
                        using (Process p = Process.Start(psi))
                        {
                            string output = p.StandardOutput.ReadToEnd().Trim();
                            p.WaitForExit(2500);
                            if (!string.IsNullOrEmpty(output))
                                info = output;
                            else
                                info = "Repositorio Git listo";
                        }
                    }
                    catch
                    {
                        info = "Git disponible";
                    }
                }
                srv.LastCommit = info;
                if (this.IsHandleCreated)
                {
                    this.BeginInvoke((Action)(() =>
                    {
                        if (srv.CommitLabel != null)
                            srv.CommitLabel.Text = "Versión Git: " + srv.LastCommit;
                    }));
                }
            });
        }

        private void AppendLog(RichTextBox box, string message)
        {
            if (box == null || this.IsDisposed) return;
            string timestamp = DateTime.Now.ToString("HH:mm:ss");
            string formatted = string.Format("[{0}] {1}{2}", timestamp, message, Environment.NewLine);

            if (box.InvokeRequired)
            {
                try
                {
                    box.BeginInvoke((Action)(() => AppendLogDirect(box, formatted)));
                }
                catch { }
            }
            else
            {
                AppendLogDirect(box, formatted);
            }
        }

        private void AppendLogDirect(RichTextBox box, string text)
        {
            if (box.IsDisposed) return;
            if (box.TextLength > 120000)
            {
                box.Clear();
            }
            box.AppendText(text);
            box.SelectionStart = box.TextLength;
            box.ScrollToCaret();
        }

        // =========================================================================
        // WINDOWS STARTUP REGISTRY
        // =========================================================================

        private bool IsStartupEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(REG_RUN_PATH, false))
                {
                    if (key == null) return false;
                    object val = key.GetValue(REG_KEY_NAME);
                    return val != null && val.ToString().IndexOf(Application.ExecutablePath, StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        private void SetStartupEnabled(bool enable)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(REG_RUN_PATH, true))
                {
                    if (key == null) return;
                    if (enable)
                    {
                        string cmd = "\"" + Application.ExecutablePath + "\" --autostart";
                        key.SetValue(REG_KEY_NAME, cmd);
                        AppendLog(generalLogBox, "✅ [WINDOWS STARTUP] Configurado para iniciar automáticamente con Windows y encender los 3 servidores.");
                    }
                    else
                    {
                        if (key.GetValue(REG_KEY_NAME) != null)
                        {
                            key.DeleteValue(REG_KEY_NAME, false);
                        }
                        AppendLog(generalLogBox, "ℹ️ [WINDOWS STARTUP] Inicio automático con Windows desactivado.");
                    }
                }
            }
            catch (Exception ex)
            {
                AppendLog(generalLogBox, "❌ [ERROR REGISTRO WINDOWS]: " + ex.Message);
            }
        }
    }
}
