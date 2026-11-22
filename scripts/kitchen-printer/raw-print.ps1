param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath
)
$ErrorActionPreference = 'Stop'
if ($FilePath -ne '__CHECK_ONLY__' -and -not (Test-Path -LiteralPath $FilePath)) { throw 'Archivo de impresión no encontrado' }
$src = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class MarbellaRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DocInfo {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
  }

  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr handle);

  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern int StartDocPrinter(IntPtr handle, int level, ref DocInfo doc);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr handle);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr handle);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr handle);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr handle, IntPtr data, int length, out int written);

  public static void Send(string printer, byte[] bytes) {
    IntPtr handle = IntPtr.Zero;
    if (!OpenPrinter(printer, out handle, IntPtr.Zero))
      throw new Win32Exception(Marshal.GetLastWin32Error(), "No se puede abrir impresora " + printer);
    try {
      var doc = new DocInfo { pDocName = "Marbella - Comanda", pOutputFile = null, pDatatype = "RAW" };
      if (StartDocPrinter(handle, 1, ref doc) == 0)
        throw new Win32Exception(Marshal.GetLastWin32Error(), "StartDocPrinter");
      try {
        if (!StartPagePrinter(handle))
          throw new Win32Exception(Marshal.GetLastWin32Error(), "StartPagePrinter");
        try {
          IntPtr ptr = Marshal.AllocHGlobal(bytes.Length);
          try {
            Marshal.Copy(bytes, 0, ptr, bytes.Length);
            int written;
            if (!WritePrinter(handle, ptr, bytes.Length, out written) || written != bytes.Length)
              throw new Win32Exception(Marshal.GetLastWin32Error(), "WritePrinter incompleto");
          } finally { Marshal.FreeHGlobal(ptr); }
        } finally { EndPagePrinter(handle); }
      } finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }

  public static void Check(string printer) {
    IntPtr handle = IntPtr.Zero;
    if (!OpenPrinter(printer, out handle, IntPtr.Zero))
      throw new Win32Exception(Marshal.GetLastWin32Error(), "No se puede abrir impresora " + printer);
    ClosePrinter(handle);
  }
}
'@
Add-Type -TypeDefinition $src -ErrorAction Stop
if ($FilePath -eq '__CHECK_ONLY__') {
  [MarbellaRawPrinter]::Check($PrinterName)
  Write-Output 'OK: cola accesible'
  exit 0
}
[byte[]]$bytes = [System.IO.File]::ReadAllBytes($FilePath)
if ($bytes.Length -eq 0) { throw 'Ticket vacío' }
[MarbellaRawPrinter]::Send($PrinterName, $bytes)
Write-Output ('RAW entregado a la cola: ' + $bytes.Length + ' bytes')