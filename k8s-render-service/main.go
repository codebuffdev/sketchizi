package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
)

type response struct { YAML string `json:"yaml,omitempty"`; Error string `json:"error,omitempty"` }
func writeJSON(w http.ResponseWriter, status int, v response) { w.Header().Set("Content-Type","application/json"); w.WriteHeader(status); _ = json.NewEncoder(w).Encode(v) }
func cleanBundlePath(s string) (string,error) {
	s=strings.TrimPrefix(path.Clean("/"+strings.ReplaceAll(s,"\\","/")),"/")
	if s=="." || s=="" || strings.HasPrefix(s,"../") { return "", errors.New("invalid source path") }
	return s,nil
}
func extractZip(r io.ReaderAt, size int64, dest string) error {
	z,err:=zip.NewReader(r,size); if err!=nil{return err}
	if len(z.File) > 2000 { return errors.New("ZIP contains too many entries") }
	var totalUncompressed uint64
	for _,f:=range z.File {
		totalUncompressed += f.UncompressedSize64
		if totalUncompressed > 200<<20 { return errors.New("ZIP expands beyond the 200 MB limit") }
		if f.UncompressedSize64 > 20<<20 { return fmt.Errorf("ZIP entry exceeds the 20 MB limit: %s", f.Name) }
		name:=strings.ReplaceAll(f.Name,"\\","/")
		if strings.HasPrefix(name,"/") || path.Clean(name)==".." || strings.HasPrefix(path.Clean(name),"../") { return fmt.Errorf("unsafe path in ZIP: %s",name) }
		target:=filepath.Join(dest,filepath.FromSlash(name))
		if !strings.HasPrefix(target,filepath.Clean(dest)+string(os.PathSeparator)) { return errors.New("unsafe ZIP path") }
		if f.FileInfo().IsDir(){ if err=os.MkdirAll(target,0755);err!=nil{return err};continue }
		if err=os.MkdirAll(filepath.Dir(target),0755);err!=nil{return err}
		in,e:=f.Open();if e!=nil{return e}
		out,e:=os.OpenFile(target,os.O_CREATE|os.O_TRUNC|os.O_WRONLY,0644);if e!=nil{in.Close();return e}
		written,copyErr:=io.Copy(out,io.LimitReader(in,(20<<20)+1));in.Close();out.Close();if copyErr!=nil{return copyErr};if written>20<<20{return fmt.Errorf("ZIP entry exceeds the 20 MB limit: %s",f.Name)}
	}
	return nil
}
func render(w http.ResponseWriter,r *http.Request) {
	if r.Method!=http.MethodPost { writeJSON(w,405,response{Error:"POST required"});return }
	r.Body=http.MaxBytesReader(w,r.Body,50<<20)
	if err:=r.ParseMultipartForm(50<<20);err!=nil{writeJSON(w,400,response{Error:"Upload a ZIP under 50 MB."});return}
	file,_,err:=r.FormFile("bundle");if err!=nil{writeJSON(w,400,response{Error:"ZIP bundle is required."});return};defer file.Close()
	buf,err:=io.ReadAll(io.LimitReader(file,50<<20));if err!=nil{writeJSON(w,400,response{Error:"Unable to read ZIP."});return}
	source,err:=cleanBundlePath(r.FormValue("sourcePath"));if err!=nil{writeJSON(w,400,response{Error:err.Error()});return}
	kind:=r.FormValue("kind"); values:=r.FormValue("valuesFile")
	tmp,err:=os.MkdirTemp("","k8s-render-*");if err!=nil{writeJSON(w,500,response{Error:"Unable to prepare renderer."});return};defer os.RemoveAll(tmp)
	if err=extractZip(bytes.NewReader(buf),int64(len(buf)),tmp);err!=nil{writeJSON(w,400,response{Error:"Invalid ZIP: "+err.Error()});return}
	root:=tmp
	sourceAbs:=filepath.Join(root,filepath.FromSlash(source))
	if !strings.HasPrefix(sourceAbs,filepath.Clean(root)+string(os.PathSeparator)){writeJSON(w,400,response{Error:"Source path escapes the bundle."});return}
	var cmd *exec.Cmd
	switch kind {
	case "kustomize":
		if filepath.Base(source)!="kustomization.yaml" && filepath.Base(source)!="kustomization.yml" && filepath.Base(source)!="Kustomization" { writeJSON(w,400,response{Error:"Choose a kustomization file."});return }
		cmd=exec.CommandContext(r.Context(),"kubectl","kustomize",filepath.Dir(sourceAbs))
	case "helm":
		chartDir:=filepath.Dir(sourceAbs)
		args:=[]string{"template","sketchizi",chartDir}
		if values!="" {
			v,cleanErr:=cleanBundlePath(values);if cleanErr!=nil{writeJSON(w,400,response{Error:"Invalid values file path."});return}
			vabs:=filepath.Join(root,filepath.FromSlash(v));if !strings.HasPrefix(vabs,filepath.Clean(root)+string(os.PathSeparator)){writeJSON(w,400,response{Error:"Values path escapes the bundle."});return}
			if _,e:=os.Stat(vabs);e!=nil{writeJSON(w,400,response{Error:"Values file not found in the ZIP."});return}
			args=append(args,"-f",vabs)
		}
		cmd=exec.CommandContext(r.Context(),"helm",args...)
	default: writeJSON(w,400,response{Error:"kind must be kustomize or helm"});return
	}
	cmd.Dir=root
	out,err:=cmd.Output();if err!=nil{
		msg:=strings.TrimSpace(err.Error());if ee,ok:=err.(*exec.ExitError);ok{msg=strings.TrimSpace(string(ee.Stderr))}
		writeJSON(w,422,response{Error:"Rendering failed: "+msg});return
	}
	if len(bytes.TrimSpace(out))==0{writeJSON(w,422,response{Error:"Renderer produced no Kubernetes YAML."});return}
	writeJSON(w,200,response{YAML:string(out)})
}
func withCORS(next http.Handler) http.Handler {
	allowedOrigin := strings.TrimSpace(os.Getenv("FRONTEND_ORIGIN"))
	if allowedOrigin == "" { allowedOrigin = "https://sketchizi.pages.dev" }
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && origin == allowedOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}
		if r.Method == http.MethodOptions { w.WriteHeader(http.StatusNoContent); return }
		next.ServeHTTP(w, r)
	})
}
func main(){
	mux:=http.NewServeMux();mux.HandleFunc("/health",func(w http.ResponseWriter,r *http.Request){w.WriteHeader(200);_,_=w.Write([]byte("ok"))});mux.HandleFunc("/render",render)
	addr:=os.Getenv("PORT");if addr==""{addr="8080"};_ = http.ListenAndServe(":"+addr,withCORS(mux))
}
